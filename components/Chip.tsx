import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tapHaptic } from '@/lib/haptics';
import { useColors } from '@/lib/themeContext';

export type ChipVariant = 'manual' | 'ai' | 'meta' | 'add';

type Props = {
  label: string;
  selected?: boolean;
  variant?: ChipVariant;
  onPress?: () => void;
  onRemove?: () => void;
  color?: string;
  /** Optional leading element (e.g. a category icon) rendered before the label. */
  leading?: React.ReactNode;
};

/**
 * Tag/chip element. Variants:
 * - manual: solid fill (heavier weight) — user-entered tags
 * - ai: outlined (lighter weight) — AI-suggested tags
 * - meta: solid fill, used for metadata (urgency/status/etc.)
 * - add: dashed outline, for "+ add tag"
 */
export const Chip = ({ label, selected, variant = 'manual', onPress, onRemove, color, leading }: Props) => {
  const c = useColors();
  const isOutlined = variant === 'ai' || variant === 'add' || (variant === 'meta' && !selected);
  const baseStyle = isOutlined ? styles.outlined : styles.filled;
  const tint = color ?? c.ink;

  // Tap the chip body = onPress (e.g. open sidebar to modify the filter).
  // The trailing × is the dedicated remove affordance — a separate hit
  // target so the press/remove intents don't collide.
  const handleTap = onPress
    ? () => {
        void tapHaptic();
        onPress();
      }
    : onRemove
      ? () => {
          void tapHaptic();
          onRemove();
        }
      : undefined;

  const handleRemove = onRemove
    ? () => {
        void tapHaptic();
        onRemove();
      }
    : undefined;

  return (
    <Pressable
      onPress={handleTap}
      style={({ pressed }) => [
        styles.chip,
        baseStyle,
        variant === 'add' && styles.dashed,
        isOutlined && { borderColor: tint },
        !isOutlined && { backgroundColor: tint },
        pressed && { opacity: 0.7 },
      ]}
    >
      {leading}
      <Text style={[styles.label, isOutlined ? { color: tint } : { color: c.parchment }]}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable
          onPress={handleRemove}
          hitSlop={8}
          style={styles.xHit}
          accessibilityLabel="Remove filter"
        >
          <Text style={[styles.xText, isOutlined ? { color: tint } : { color: c.parchment }]}>×</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 3,
    gap: 4,
    minHeight: 26,
  },
  filled: {},
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  dashed: { borderStyle: 'dashed' },
  label: { fontSize: 14, fontWeight: '500', letterSpacing: 0.3 },
  x: { paddingHorizontal: 2 },
  xHit: { paddingHorizontal: 2, marginLeft: 2 },
  xText: { fontSize: 16, lineHeight: 16, fontWeight: '600' },
});

// Re-export View for layout convenience in callers (rows of chips).
export const ChipRow = View;
