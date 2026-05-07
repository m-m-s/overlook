import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/lib/colors';

type ToastKind = 'info' | 'error';
type ToastEntry = { id: number; message: string; kind: ToastKind };

type ToastApi = {
  show: (message: string, kind?: ToastKind) => void;
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

  const dismiss = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setToast(null);
    });
  }, [opacity]);

  const show = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: ++nextId, message, kind });
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => dismiss(), 4000);
    },
    [dismiss, opacity],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const api: ToastApi = {
    show,
    info: (m) => show(m, 'info'),
    error: (m) => show(m, 'error'),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrap,
            { opacity },
          ]}
        >
          <Pressable
            onPress={dismiss}
            style={[styles.toast, toast.kind === 'error' && styles.toastError]}
          >
            <Text style={[styles.text, toast.kind === 'error' && styles.textError]}>
              {toast.message}
            </Text>
          </Pressable>
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
    backgroundColor: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 4,
    maxWidth: 600,
  },
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
});
