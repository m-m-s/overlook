import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { Circle, Line, Svg } from 'react-native-svg';

import { lightPalette } from '@/lib/colors';

type Props = {
  level: 1 | 2 | 3;
  size?: number;
  color?: string;
  /** When true, the rings render solid-filled (selected look). Default: outlined. */
  filled?: boolean;
  /** Background to use as the inner negative-space color when filled. Defaults to parchment. */
  fillBackground?: string;
  /** Spin the iris (used during processing). */
  spinning?: boolean;
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
export const Iris = ({
  level,
  size = 24,
  color = lightPalette.parchment,
  filled = false,
  fillBackground = lightPalette.parchment,
  spinning,
  accessibilityLabel,
}: Props) => {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!spinning) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [spinning, spin]);

  const transform = spinning
    ? [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }]
    : undefined;

  return (
    <Animated.View
      accessible
      accessibilityLabel={accessibilityLabel ?? LEVEL_LABELS[level]}
      accessibilityRole="image"
      style={transform ? { transform } : undefined}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {level === 1 && (
          <Line
            x1="4"
            y1="12"
            x2="20"
            y2="12"
            stroke={color}
            strokeWidth={filled ? 3 : 2}
            strokeLinecap="round"
          />
        )}
        {level === 2 && (
          <>
            {filled ? (
              <Circle cx="12" cy="12" r="9" fill={color} />
            ) : (
              <Circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth={1.75} />
            )}
            <Circle cx="12" cy="12" r="2" fill={filled ? fillBackground : color} />
          </>
        )}
        {level === 3 && (
          <>
            {filled ? (
              <>
                <Circle cx="12" cy="12" r="9" fill={color} />
                <Circle cx="12" cy="12" r="5.5" fill={fillBackground} />
                <Circle cx="12" cy="12" r="2" fill={color} />
              </>
            ) : (
              <>
                <Circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth={1.75} />
                <Circle cx="12" cy="12" r="5.5" fill="none" stroke={color} strokeWidth={1.75} />
                <Circle cx="12" cy="12" r="2" fill={color} />
              </>
            )}
          </>
        )}
      </Svg>
    </Animated.View>
  );
};
