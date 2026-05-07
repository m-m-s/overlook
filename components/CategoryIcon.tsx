import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/lib/colors';

export type Category =
  | 'craft'
  | 'fashion'
  | 'film'
  | 'tv'
  | 'food'
  | 'art'
  | 'music'
  | 'places'
  | 'meme'
  | 'messages'
  | 'shopping'
  | 'reading'
  | 'events'
  | 'tech'
  | 'documents';

type Props = {
  category: Category | string | null | undefined;
  size?: number;
  color?: string;
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
  music: 'musical-notes',
  places: 'location',
  meme: 'happy',
  messages: 'chatbubble',
  shopping: 'bag',
  reading: 'book',
  events: 'calendar',
  tech: 'code-slash',
  documents: 'document',
};

export const CategoryIcon = ({ category, size = 22, color = colors.parchment }: Props) => {
  if (!category) return null;
  const name = ICON_NAME[category as Category];
  if (!name) return null;
  return <Ionicons name={name} size={size} color={color} />;
};
