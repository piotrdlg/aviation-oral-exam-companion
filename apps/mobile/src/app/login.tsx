import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { H1, MicroLabel, PrimaryButton, Screen } from '@/components/cockpit';
import { supabase } from '@/lib/supabase';
import { colors, font, fontSize, radius, space } from '@/theme/tokens';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    if (!email.includes('@')) {
      setError('Enter a valid email.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setStage('code');
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) setError(error.message);
    // success → onAuthStateChange → the root gate redirects to /(tabs)
  }

  async function oauth(provider: 'google' | 'azure') {
    setBusy(true);
    setError(null);
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
      setBusy(false);
      setError(error?.message ?? 'Could not start sign-in.');
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === 'success' && result.url) {
      const authCode = new URL(result.url).searchParams.get('code');
      if (authCode) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(authCode);
        if (exErr) setError(exErr.message);
      }
    }
    setBusy(false);
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
      <OAuthButton icon="logo-apple" label="Sign in with Apple" disabled note="Available once Apple sign-in is configured" />

      <Text style={styles.legal}>By continuing you agree to the Terms of Service and Privacy Policy.</Text>
    </Screen>
  );
}

function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
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
