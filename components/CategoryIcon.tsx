import { Ionicons } from '@expo/vector-icons';

import { lightPalette } from '@/lib/colors';

export type Category =
  | 'craft'
  | 'fashion'
  | 'film'
  | 'tv'
  | 'food'
  | 'art'
  | 'design'
  | 'music'
  | 'places'
  | 'meme'
  | 'messages'
  | 'social'
  | 'shopping'
  | 'reading'
  | 'events'
  | 'tech'
  | 'documents';

type Props = {
  category: Category | string | null | undefined;
  size?: number;
  color?: string;
  accessibilityLabel?: string;
  /** Adds a soft dark text-shadow so the icon stays legible against bright
   *  card thumbnails. Defaults off — only the gallery card opts in. */
  shadow?: boolean;
};

/**
 * Category icon — silhouette per spec ("silhouette style, 24x24 viewbox,
 * drop shadow only, no pill/container").
 *
 * Sprint v1 uses Ionicons (single library so stroke weights are consistent);
 * spec calls for hand-drawn 24x24 SVGs which can be a polish pass later.
 */
const ICON_NAME: Record<Category, React.ComponentProps<typeof Ionicons>['name']> = {
  craft: 'cut',
  fashion: 'shirt',
  film: 'film',
  tv: 'tv',
  food: 'restaurant',
  art: 'color-palette',
  design: 'color-wand',
  music: 'musical-notes',
  places: 'location',
  meme: 'happy',
  messages: 'chatbubble',
  social: 'people',
  shopping: 'bag',
  reading: 'book',
  events: 'calendar',
  tech: 'code-slash',
  documents: 'document',
};

export const CategoryIcon = ({
  category,
  size = 22,
  color = lightPalette.parchment,
  accessibilityLabel,
  shadow = false,
}: Props) => {
  if (!category) return null;
  const name = ICON_NAME[category as Category];
  if (!name) return null;
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      style={
        shadow
          ? {
              textShadowColor: 'rgba(0,0,0,0.85)',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 6,
            }
          : undefined
      }
      accessibilityLabel={accessibilityLabel ?? `Category: ${category}`}
    />
  );
};
