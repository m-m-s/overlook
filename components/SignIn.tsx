import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { sendMagicLink, verifyEmailOtp } from '@/lib/auth';
import { colors } from '@/lib/colors';

type Status = 'idle' | 'sending' | 'sent' | 'verifying' | 'error';

export const SignIn = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
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
      setErrorMsg('Enter the 6-digit code from the email');
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.wrap}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Overlook</Text>
        <Text style={styles.sub}>your screenshot library</Text>

        {status === 'sent' || status === 'verifying' ? (
          <View style={styles.sentBox}>
            <Text style={styles.sentTitle}>check your email</Text>
            <Text style={styles.sentBody}>
              we sent a 6-digit code + a link to {email}. enter the code below, or tap the link from this device.
            </Text>

            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="000000"
              placeholderTextColor={colors.inkMuted}
              keyboardType="number-pad"
              maxLength={6}
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
                <ActivityIndicator color={colors.parchment} />
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
                <ActivityIndicator color={colors.parchment} />
              ) : (
                <Text style={styles.btnText}>send magic link</Text>
              )}
            </Pressable>
            {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.parchment },
  inner: { flex: 1, justifyContent: 'center', padding: 32 },
  title: { fontFamily: 'Georgia', fontSize: 44, color: colors.ink, letterSpacing: -0.5 },
  sub: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginTop: 6,
    marginBottom: 40,
  },
  input: {
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.ink,
    paddingVertical: 12,
    fontSize: 18,
    color: colors.ink,
    fontFamily: 'Georgia',
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
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  error: { color: '#C0392B', marginTop: 16, fontSize: 14 },
  sentBox: { paddingVertical: 12 },
  sentTitle: { fontFamily: 'Georgia', fontSize: 22, color: colors.ink, marginBottom: 12 },
  sentBody: { color: colors.ink, fontSize: 15, lineHeight: 22, marginBottom: 24 },
  codeInput: {
    fontFamily: 'Georgia',
    fontSize: 28,
    letterSpacing: 8,
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
});
