function assertSentrySettings(env, requireToken = false) {
  if (!['preview', 'production'].includes(env.EAS_BUILD_PROFILE)) return;
  const required = ['EXPO_PUBLIC_SENTRY_DSN', 'SENTRY_ORG', 'SENTRY_PROJECT'];
  if (requireToken) required.push('SENTRY_AUTH_TOKEN');
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Release crash reporting requires: ${missing.join(', ')}`);
  for (const key of ['SENTRY_DISABLE_AUTO_UPLOAD', 'SENTRY_ALLOW_FAILURE']) {
    if (env[key] && !['false', '0'].includes(env[key].toLowerCase())) {
      throw new Error(`${key} cannot bypass source-map upload in a release build`);
    }
  }
}
module.exports = { assertSentrySettings };
if (require.main === module) {
  assertSentrySettings(process.env, true);
  console.log('Sentry build requirements checked (no credential values logged).');
}
