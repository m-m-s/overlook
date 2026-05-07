import { View } from 'react-native';
import { Circle, Line, Svg } from 'react-native-svg';

import { colors } from '@/lib/colors';

type Props = {
  level: 1 | 2 | 3;
  size?: number;
  color?: string;
  /** Override the auto-generated accessibilityLabel. */
  accessibilityLabel?: string;
};

const LEVEL_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Resonance level 1: faint',
  2: 'Resonance level 2: noticed',
  3: 'Resonance level 3: strong',
};

/**
 * Resonance iris icon per spec — concentric circles, no lashes.
 * Level 1: single horizontal line
 * Level 2: outer circle + filled center dot
 * Level 3: outer circle + middle circle + filled center dot
 */
export const Iris = ({ level, size = 24, color = colors.parchment, accessibilityLabel }: Props) => {
  return (
    <View accessible accessibilityLabel={accessibilityLabel ?? LEVEL_LABELS[level]} accessibilityRole="image">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {level === 1 && <Line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth={2} strokeLinecap="round" />}
        {level === 2 && (
          <>
            <Circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth={1.75} />
            <Circle cx="12" cy="12" r="2" fill={color} />
          </>
        )}
        {level === 3 && (
          <>
            <Circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth={1.75} />
            <Circle cx="12" cy="12" r="5.5" fill="none" stroke={color} strokeWidth={1.75} />
            <Circle cx="12" cy="12" r="2" fill={color} />
          </>
        )}
      </Svg>
    </View>
  );
};
