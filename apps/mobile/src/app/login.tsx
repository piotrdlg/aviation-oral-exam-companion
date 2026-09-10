import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { H1, MicroLabel, PrimaryButton, Screen } from '@/components/cockpit';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { config } from '@/lib/config';
import { colors, font, fontSize, radius, space } from '@/theme/tokens';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  async function signIn(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try { await action(); } catch (error) {
      if ((error as { code?: string })?.code !== 'ERR_REQUEST_CANCELED') {
        setError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.');
      }
    } finally { pending.current = false; setBusy(false); }
  }

  async function apple() {
    await signIn(async () => {
      const nonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) throw new Error('Apple did not return a sign-in token. Please retry.');
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce });
      if (error) throw error;
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
      if (fullName) {
        const displayName = fullName.slice(0, 50);
        // Apple supplies the name only on first authorization. Persist it in auth
        // metadata as well as the profile so onboarding can recover it on retry.
        await supabase.auth.updateUser({ data: { full_name: fullName } });
        await apiFetch('/api/user/tier', { method: 'POST', json: { displayName } });
      }
    });
  }

  async function sendCode() {
    if (!email.includes('@')) {
      setError('Enter a valid email.');
      return;
    }
    await signIn(async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
    else setStage('code');
    });
  }

  async function verify() {
    await signIn(async () => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (error) throw error;
    });
    // success → onAuthStateChange → the root gate redirects to /(tabs)
  }

  async function oauth(provider: 'google' | 'azure') {
    await signIn(async () => {
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        // Azure returns no email under the bare openid scope (matches the web fix).
        scopes: provider === 'azure' ? 'openid email profile' : undefined,
      },
    });
    if (error || !data?.url) {
      throw new Error(error?.message ?? 'Could not start sign-in.');
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === 'success' && result.url) {
      const authCode = new URL(result.url).searchParams.get('code');
      if (authCode) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(authCode);
        if (exErr) throw exErr;
      } else {
        throw new Error('Sign-in did not return an authorization code. Please retry.');
      }
    }
    });
  }

  return (
    <Screen scroll>
      <View style={styles.brand}>
        <Text style={styles.wordmark}>HeyDPE</Text>
      </View>
      <MicroLabel>SIGN IN</MicroLabel>
      <H1>Welcome back</H1>

      {stage === 'email' ? (
        <>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            editable={!busy}
          />
          <View style={{ height: space[4] }} />
          {busy ? <Loader /> : <PrimaryButton label="Send code" onPress={sendCode} />}
        </>
      ) : (
        <>
          <Text style={styles.sentTo}>A 6-digit code was sent to {email}.</Text>
          <Field
            label="Code"
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={6}
            editable={!busy}
          />
          <View style={{ height: space[4] }} />
          {busy ? <Loader /> : <PrimaryButton label="Verify & continue" onPress={verify} />}
          <Pressable
            onPress={() => {
              setStage('email');
              setCode('');
              setError(null);
            }}
            style={styles.linkBtn}>
            <Text style={styles.link}>Use a different email</Text>
          </Pressable>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.or}>or</Text>
        <View style={styles.line} />
      </View>

      <OAuthButton icon="logo-google" label="Continue with Google" onPress={() => oauth('google')} disabled={busy} />
      <OAuthButton icon="logo-microsoft" label="Continue with Microsoft" onPress={() => oauth('azure')} disabled={busy} />
      {appleAvailable ? <View pointerEvents={busy ? 'none' : 'auto'}>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={8}
          style={{ height: 50, marginBottom: space[3] }}
          onPress={apple}
        />
      </View> : null}

      <Text style={styles.legal}>By continuing you agree to the Terms of Service and Privacy Policy.</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Pressable accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(`${config.apiUrl}/terms`)} style={styles.linkBtn}><Text style={styles.link}>Terms of Service</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(`${config.apiUrl}/privacy`)} style={styles.linkBtn}><Text style={styles.link}>Privacy Policy</Text></Pressable>
      </View>
    </Screen>
  );
}

function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.dim}
        style={styles.input}
      />
    </View>
  );
}

function Loader() {
  return (
    <View style={styles.loader}>
      <ActivityIndicator color={colors.amber} />
    </View>
  );
}

function OAuthButton({
  icon,
  label,
  onPress,
  disabled,
  note,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.oauth, pressed && { backgroundColor: colors.border }, disabled && { opacity: 0.45 }]}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={styles.oauthLabel}>{label}</Text>
      {note ? <Text style={styles.oauthNote}>{note}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginTop: space[5], marginBottom: space[6] },
  wordmark: {
    fontFamily: font.mono,
    fontSize: 22,
    letterSpacing: 6,
    color: colors.amber,
  },
  fieldLabel: {
    fontFamily: font.mono,
    fontSize: fontSize.micro,
    letterSpacing: 2,
    color: colors.muted,
    marginBottom: space[2],
  },
  input: {
    fontFamily: font.sans,
    fontSize: fontSize.base,
    color: colors.text,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    minHeight: 50,
  },
  sentTo: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.muted, marginBottom: space[4] },
  loader: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  linkBtn: { alignItems: 'center', paddingVertical: space[3] },
  link: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.cyanReadable },
  error: {
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    color: colors.red,
    marginTop: space[4],
    textAlign: 'center',
  },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginVertical: space[6] },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  or: { fontFamily: font.mono, fontSize: fontSize.micro, color: colors.dim, letterSpacing: 1 },
  oauth: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 50,
    paddingHorizontal: space[4],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bezel,
    marginBottom: space[3],
  },
  oauthLabel: { fontFamily: font.sansMedium, fontSize: fontSize.base, color: colors.text },
  oauthNote: { fontFamily: font.mono, fontSize: 11, color: colors.dim, marginLeft: 'auto' },
  legal: {
    fontFamily: font.sans,
    fontSize: fontSize.xs,
    color: colors.dim,
    textAlign: 'center',
    marginTop: space[5],
  },
});
