#!/usr/bin/env node
/**
 * Generate the Apple "Sign in with Apple" client_secret JWT for Supabase.
 *
 * WHY: Apple's client_secret is an ES256 JWT signed by your .p8 key, and Apple
 * caps its lifetime at 6 months. Supabase (web/OAuth flow) does NOT auto-rotate
 * it, so it must be regenerated every ~5 months or Apple logins break
 * (error: invalid_client). This script mints a fresh one with ZERO npm deps.
 *
 * USAGE (run locally — needs your .p8 private key, which is NOT in this repo):
 *   APPLE_KEY_ID=XXXXXXXXXX \
 *   APPLE_P8_PATH=/secure/path/AuthKey_XXXXXXXXXX.p8 \
 *   node scripts/ops/generate-apple-client-secret.mjs | pbcopy
 *
 * Then paste (already on your clipboard via pbcopy) into:
 *   Supabase Dashboard -> Authentication -> Providers -> Apple -> "Secret Key (for OAuth)"
 *
 * Defaults below are HeyDPE's values; override via env if they ever change.
 *   APPLE_TEAM_ID     default 45K5W4N8DG       (your Apple Developer Team ID)
 *   APPLE_SERVICES_ID default com.heydpe.auth  (the Services ID = Supabase "Client IDs")
 *   APPLE_VALID_DAYS  default 180              (hard-capped at 180 by Apple)
 *
 * SECURITY: the printed JWT is a secret. Don't commit it, don't paste it into
 * any third-party website. The .p8 key never expires — keep it safe and reuse it.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const TEAM_ID = process.env.APPLE_TEAM_ID || '45K5W4N8DG';
const SERVICES_ID = process.env.APPLE_SERVICES_ID || 'com.heydpe.auth';
const KEY_ID = process.env.APPLE_KEY_ID;
const P8_PATH = process.env.APPLE_P8_PATH;
const VALID_DAYS = Math.min(parseInt(process.env.APPLE_VALID_DAYS || '180', 10) || 180, 180);

if (!KEY_ID || !P8_PATH) {
  console.error('ERROR: set APPLE_KEY_ID and APPLE_P8_PATH.');
  console.error('  APPLE_KEY_ID=ABC123DEFG APPLE_P8_PATH=./AuthKey_ABC123DEFG.p8 \\');
  console.error('    node scripts/ops/generate-apple-client-secret.mjs');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const exp = now + VALID_DAYS * 24 * 60 * 60;

const b64url = (v) =>
  Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

const header = { alg: 'ES256', kid: KEY_ID };
const payload = { iss: TEAM_ID, iat: now, exp, aud: 'https://appleid.apple.com', sub: SERVICES_ID };
const signingInput = `${b64url(header)}.${b64url(payload)}`;

let privateKey;
try {
  privateKey = crypto.createPrivateKey(fs.readFileSync(P8_PATH));
} catch (e) {
  console.error(`ERROR reading/parsing .p8 at ${P8_PATH}: ${e.message}`);
  process.exit(1);
}

// ES256 -> ECDSA P-256 + SHA-256, JOSE signature must be raw r||s (ieee-p1363), not DER.
const signature = crypto
  .sign('sha256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  .toString('base64url');

const jwt = `${signingInput}.${signature}`;
const expDate = new Date(exp * 1000).toISOString().slice(0, 10);

console.error(`\n✅ Apple client_secret generated`);
console.error(`   Team ID:     ${TEAM_ID}`);
console.error(`   Services ID: ${SERVICES_ID}   <- Supabase "Client IDs" field`);
console.error(`   Key ID:      ${KEY_ID}`);
console.error(`   Expires:     ${expDate}   <- set reminder ~2 weeks before this; update docs/ops/oauth-secret-expiry.json`);
console.error(`\n--- JWT below (stdout). Paste into Supabase -> Auth -> Providers -> Apple -> "Secret Key (for OAuth)" ---\n`);
console.log(jwt);
