import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/colors';
import { tapHaptic } from '@/lib/haptics';

export type ChipVariant = 'manual' | 'ai' | 'meta' | 'add';

type Props = {
  label: string;
  selected?: boolean;
  variant?: ChipVariant;
  onPress?: () => void;
  onRemove?: () => void;
  color?: string;
};

/**
 * Tag/chip element. Variants:
 * - manual: solid fill (heavier weight) — user-entered tags
 * - ai: outlined (lighter weight) — AI-suggested tags
 * - meta: solid fill, used for metadata (urgency/status/etc.)
 * - add: dashed outline, for "+ add tag"
 */
export const Chip = ({ label, selected, variant = 'manual', onPress, onRemove, color }: Props) => {
  const isOutlined = variant === 'ai' || variant === 'add' || (variant === 'meta' && !selected);
  const baseStyle = isOutlined ? styles.outlined : styles.filled;
  const tint = color ?? colors.ink;

  return (
    <Pressable
      onPress={onPress ? () => { void tapHaptic(); onPress(); } : undefined}
      style={({ pressed }) => [
        styles.chip,
        baseStyle,
        variant === 'add' && styles.dashed,
        isOutlined && { borderColor: tint },
        !isOutlined && { backgroundColor: tint },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.label, isOutlined ? { color: tint } : { color: colors.parchment }]}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} style={styles.x}>
          <Text style={[styles.xText, isOutlined ? { color: tint } : { color: colors.parchment }]}>×</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 3,
    gap: 4,
  },
  filled: {},
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  dashed: { borderStyle: 'dashed' },
  label: { fontSize: 12, fontWeight: '500', letterSpacing: 0.2 },
  x: { paddingHorizontal: 2 },
  xText: { fontSize: 14, lineHeight: 14, fontWeight: '600' },
});

// Re-export View for layout convenience in callers (rows of chips).
export const ChipRow = View;
