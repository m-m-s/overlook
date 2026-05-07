import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { animDuration, useReduceMotion } from '@/lib/a11y';
import { colors } from '@/lib/colors';

type ToastKind = 'info' | 'error';
type ToastAction = { label: string; onPress: () => void };
type ToastEntry = { id: number; message: string; kind: ToastKind; action?: ToastAction; durationMs: number };

type ToastApi = {
  show: (message: string, opts?: { kind?: ToastKind; action?: ToastAction; durationMs?: number }) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};

let nextId = 0;

/**
 * Lightweight toast for sprint use. One toast at a time, auto-dismisses after
 * 4s. Tap to dismiss early. Sits at the top of the screen, above content.
 */
export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toast, setToast] = useState<ToastEntry | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReduceMotion();

  const dismiss = useCallback(() => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: animDuration(180, reduceMotion),
      useNativeDriver: true,
    }).start(() => {
      setToast(null);
    });
  }, [opacity, reduceMotion]);

  const show = useCallback(
    (message: string, opts: { kind?: ToastKind; action?: ToastAction; durationMs?: number } = {}) => {
      if (timer.current) clearTimeout(timer.current);
      const durationMs = opts.durationMs ?? 4000;
      setToast({ id: ++nextId, message, kind: opts.kind ?? 'info', action: opts.action, durationMs });
      Animated.timing(opacity, {
        toValue: 1,
        duration: animDuration(180, reduceMotion),
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(() => dismiss(), durationMs);
    },
    [dismiss, opacity, reduceMotion],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const api: ToastApi = {
    show,
    info: (m) => show(m, { kind: 'info' }),
    error: (m) => show(m, { kind: 'error' }),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { opacity }]}
        >
          <View style={[styles.toast, toast.kind === 'error' && styles.toastError]}>
            <Pressable onPress={dismiss} style={styles.toastTextRow}>
              <Text style={[styles.text, toast.kind === 'error' && styles.textError]}>
                {toast.message}
              </Text>
            </Pressable>
            {toast.action && (
              <Pressable
                onPress={() => {
                  toast.action?.onPress();
                  dismiss();
                }}
                style={styles.actionBtn}
              >
                <Text style={styles.actionText}>{toast.action.label}</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 50,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 4,
    maxWidth: 600,
    minHeight: 44,
  },
  toastTextRow: { flex: 1, flexShrink: 1 },
  toastError: {
    backgroundColor: '#C0392B',
  },
  text: {
    color: colors.parchment,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  textError: {
    color: colors.parchment,
  },
  actionBtn: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.parchment,
  },
  actionText: {
    color: colors.parchment,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
