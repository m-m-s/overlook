import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from './CategoryIcon';
import { Iris } from './Iris';
import { colors, statusColors, urgencyColors } from '@/lib/colors';

export type Resonance = 1 | 2 | 3;

export type CardData = {
  id: string;
  uri: string;
  category?: string | null;
  status?: keyof typeof statusColors | null;
  urgency?: keyof typeof urgencyColors | null;
  resonance?: Resonance | null;
};

type Props = {
  data: CardData;
  analyzing?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

/**
 * Library grid card per spec:
 * - Full-bleed square thumbnail (sharp corners)
 * - Top edge: connected gradient (status -> urgency), transparent when absent
 * - Bottom-left: category silhouette icon with drop shadow
 * - Bottom-right: resonance iris icon with drop shadow
 *
 * Sprint note: vertical fade on the gradient band is omitted for v1 — it's a
 * sharp horizontal band ~22% of card height. Soften pass deferred (NOTES.md).
 */
export const Card = ({ data, analyzing, onPress, onLongPress }: Props) => {
  const statusColor = data.status ? statusColors[data.status] : undefined;
  const urgencyColor = data.urgency ? urgencyColors[data.urgency] : undefined;
  const showEdge = Boolean(statusColor && statusColor !== 'transparent') || Boolean(urgencyColor);

  const edgeColors: [string, string, string, string] = [
    statusColor && statusColor !== 'transparent' ? statusColor : 'rgba(0,0,0,0)',
    statusColor && statusColor !== 'transparent' ? statusColor : 'rgba(0,0,0,0)',
    urgencyColor ?? 'rgba(0,0,0,0)',
    urgencyColor ?? 'rgba(0,0,0,0)',
  ];

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
    >
      <Image source={{ uri: data.uri }} style={styles.image} contentFit="cover" />

      {showEdge && (
        <LinearGradient
          colors={edgeColors}
          locations={[0, 0.35, 0.65, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.edgeBand}
          pointerEvents="none"
        />
      )}

      <View style={styles.bottomLeft} pointerEvents="none">
        <CategoryIcon category={data.category} />
      </View>

      {data.resonance ? (
        <View style={styles.bottomRight} pointerEvents="none">
          <Iris level={data.resonance} />
        </View>
      ) : null}

      {analyzing && (
        <View style={styles.analyzingPill} pointerEvents="none">
          <View style={styles.analyzingDot} />
          <View style={styles.analyzingDot} />
          <View style={styles.analyzingDot} />
        </View>
      )}
    </Pressable>
  );
};

const ICON_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.55,
  shadowRadius: 3,
  elevation: 4,
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: colors.divider,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  edgeBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '22%',
  },
  bottomLeft: { position: 'absolute', left: 8, bottom: 8, ...ICON_SHADOW },
  bottomRight: { position: 'absolute', right: 8, bottom: 8, ...ICON_SHADOW },
  analyzingPill: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 10,
    alignItems: 'center',
  },
  analyzingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.parchment,
  },
});
