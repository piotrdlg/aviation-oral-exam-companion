import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (profile && ['preview', 'production', 'smoke'].includes(profile)) {
    const devVariables = Object.keys(process.env).filter((key) => key.startsWith('EXPO_PUBLIC_DEV_') && process.env[key]);
    if (devVariables.length) throw new Error(`Remove development credentials from the ${profile} build environment: ${devVariables.join(', ')}`);
    for (const key of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']) {
      if (!process.env[key]) throw new Error(`Missing required release setting: ${key}`);
    }
  }
  return { ...config, name: 'HeyDPE', slug: 'heydpe' };
};
