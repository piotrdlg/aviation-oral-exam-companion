import type { ConfigContext, ExpoConfig } from 'expo/config';
import { assertSentrySettings } from './scripts/sentry-build-policy.cjs';

export default ({ config }: ConfigContext): ExpoConfig => {
  const profile = process.env.EAS_BUILD_PROFILE;
  // Secret tokens exist on the EAS worker, not during local config resolution.
  assertSentrySettings(process.env);
  if (profile && ['preview', 'production', 'smoke'].includes(profile)) {
    const devVariables = Object.keys(process.env).filter((key) => key.startsWith('EXPO_PUBLIC_DEV_') && process.env[key]);
    if (devVariables.length) throw new Error(`Remove development credentials from the ${profile} build environment: ${devVariables.join(', ')}`);
    for (const key of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']) {
      if (!process.env[key]) throw new Error(`Missing required release setting: ${key}`);
    }
  }
  const plugins = (config.plugins ?? []).map((plugin) => {
    const name = typeof plugin === 'string' ? plugin : plugin[0];
    return name === '@sentry/react-native/expo'
      ? [name, { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT }] as [string, Record<string, unknown>]
      : plugin;
  });
  return { ...config, plugins, name: 'HeyDPE', slug: 'heydpe' };
};
