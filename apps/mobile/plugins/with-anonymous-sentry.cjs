const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const marker = '// HeyDPE native crash privacy.';
function patchDelegate(source) {
  if (source.includes(marker)) return source;
  const anchor = '    let delegate = ReactNativeDelegate()';
  if (!source.includes(anchor)) throw new Error('Anonymous Sentry: unsupported AppDelegate template; review startup insertion.');
  const helper = readFileSync(join(__dirname, 'anonymous-sentry.swift'), 'utf8');
  return 'import Sentry\n' + source.replace(anchor, '    startAnonymousSentry()\n' + anchor) + '\n' + helper;
}
module.exports = function withAnonymousSentry(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.HeyDPESentryDSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') throw new Error('Anonymous Sentry requires the SDK 57 Swift AppDelegate.');
    mod.modResults.contents = patchDelegate(mod.modResults.contents);
    return mod;
  });
};
module.exports.patchDelegate = patchDelegate;
