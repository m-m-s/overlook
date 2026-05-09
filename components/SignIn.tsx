import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Iris } from './Iris';
import { sendMagicLink, signInWithPassword, signUpWithPassword, verifyEmailOtp } from '@/lib/auth';
import { colors } from '@/lib/colors';

type Mode = 'magic' | 'password';
type Status = 'idle' | 'sending' | 'sent' | 'verifying' | 'pwd-loading' | 'error';

export const SignIn = () => {
  const [mode, setMode] = useState<Mode>('magic');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSend = async () => {
    if (!email.includes('@')) {
      setErrorMsg('Enter a valid email');
      setStatus('error');
      return;
    }
    setStatus('sending');
    setErrorMsg(null);
    const { error } = await sendMagicLink(email);
    if (error) {
      setErrorMsg(error);
      setStatus('error');
    } else {
      setStatus('sent');
    }
  };

  const onVerify = async () => {
    if (code.trim().length < 6) {
      setErrorMsg('Enter the code from the email');
      return;
    }
    setStatus('verifying');
    setErrorMsg(null);
    const { error } = await verifyEmailOtp(email, code);
    if (error) {
      setErrorMsg(error);
      setStatus('sent'); // back to sent so they can retry
    }
    // success: useSession picks up the new session; this component unmounts
  };

  const onPasswordAuth = async (action: 'signin' | 'signup') => {
    if (!email.includes('@')) {
      setErrorMsg('Enter a valid email');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters');
      return;
    }
    setStatus('pwd-loading');
    setErrorMsg(null);
    const { error } =
      action === 'signin'
        ? await signInWithPassword(email, password)
        : await signUpWithPassword(email, password);
    if (error) {
      setErrorMsg(error);
      setStatus('idle');
    }
    // success: useSession picks up the new session; this component unmounts
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setStatus('idle');
    setErrorMsg(null);
    setCode('');
    setPassword('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.wrap}
    >
      <View style={styles.inner}>
        <View style={styles.hero}>
          <Iris level={3} size={48} color={colors.ink} />
        </View>
        <Text style={styles.title}>Overlook</Text>
        <Text style={styles.sub}>your screenshot library</Text>

        {mode === 'password' ? (
          <View>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="email"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={status !== 'pwd-loading'}
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="password"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
              secureTextEntry
              editable={status !== 'pwd-loading'}
              style={styles.input}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => onPasswordAuth('signin')}
                disabled={status === 'pwd-loading'}
                style={({ pressed }) => [styles.btn, { flex: 1 }, pressed && { opacity: 0.7 }]}
              >
                {status === 'pwd-loading' ? (
                  <Iris level={3} size={18} color={colors.parchment} spinning />
                ) : (
                  <Text style={styles.btnText}>sign in</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => onPasswordAuth('signup')}
                disabled={status === 'pwd-loading'}
                style={({ pressed }) => [styles.btnOutlined, { flex: 1 }, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.btnOutlinedText}>sign up</Text>
              </Pressable>
            </View>
            {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
            <Pressable onPress={() => switchMode('magic')} style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>← back to magic link</Text>
            </Pressable>
            <Text style={styles.devNote}>
              Dev fallback. Magic link is the primary path. Requires &quot;confirm email&quot; turned OFF in Supabase auth settings for sign-up to work without sending email.
            </Text>
          </View>
        ) : status === 'sent' || status === 'verifying' ? (
          <View style={styles.sentBox}>
            <Text style={styles.sentTitle}>check your email</Text>
            <Text style={styles.sentBody}>
              We sent a code + a link to {email}. Enter the code below, or tap the link from this device.
            </Text>

            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="00000000"
              placeholderTextColor={colors.inkMuted}
              keyboardType="number-pad"
              maxLength={8}
              autoFocus
              editable={status !== 'verifying'}
              style={[styles.input, styles.codeInput]}
            />
            <Pressable
              onPress={onVerify}
              disabled={status === 'verifying'}
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
            >
              {status === 'verifying' ? (
                <Iris level={3} size={18} color={colors.parchment} spinning />
              ) : (
                <Text style={styles.btnText}>sign in</Text>
              )}
            </Pressable>

            {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}

            <Pressable onPress={() => { setStatus('idle'); setCode(''); setErrorMsg(null); }} style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>use a different email</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="email"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={status !== 'sending'}
              style={styles.input}
            />
            <Pressable
              onPress={onSend}
              disabled={status === 'sending'}
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
            >
              {status === 'sending' ? (
                <Iris level={3} size={18} color={colors.parchment} spinning />
              ) : (
                <Text style={styles.btnText}>send magic link</Text>
              )}
            </Pressable>
            {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
            <Pressable onPress={() => switchMode('password')} style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>use password instead (dev)</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.parchment },
  inner: { flex: 1, justifyContent: 'center', padding: 32 },
  hero: { marginBottom: 18, opacity: 0.9 },
  title: { fontFamily: 'PlayfairDisplay_500Medium', fontSize: 44, color: colors.ink, letterSpacing: -0.5 },
  sub: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginTop: 6,
    marginBottom: 40,
  },
  input: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: colors.ink,
    paddingVertical: 12,
    fontSize: 18,
    color: colors.ink,
    fontFamily: 'PlayfairDisplay_500Medium',
    marginBottom: 24,
  },
  btn: {
    backgroundColor: colors.ink,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 4,
  },
  btnText: {
    color: colors.parchment,
    fontSize: 15,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  error: { color: '#C0392B', marginTop: 16, fontSize: 14 },
  sentBox: { paddingVertical: 12 },
  sentTitle: { fontFamily: 'PlayfairDisplay_500Medium', fontSize: 22, color: colors.ink, marginBottom: 12 },
  sentBody: { color: colors.ink, fontSize: 15, lineHeight: 22, marginBottom: 24 },
  codeInput: {
    fontFamily: 'PlayfairDisplay_500Medium',
    fontSize: 24,
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: 16,
  },
  linkBtn: { marginTop: 24 },
  linkBtnText: {
    color: colors.inkMuted,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textDecorationLine: 'underline',
  },
  btnOutlined: {
    borderWidth: 1,
    borderColor: colors.ink,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 4,
  },
  btnOutlinedText: {
    color: colors.ink,
    fontSize: 15,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  devNote: {
    marginTop: 24,
    fontSize: 11,
    color: colors.inkMuted,
    fontStyle: 'italic',
    lineHeight: 16,
  },
});
