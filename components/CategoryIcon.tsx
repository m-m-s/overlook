import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

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
 * Category icon — silhouette per spec. Sprint v1 uses @expo/vector-icons for
 * speed; can be swapped to hand-drawn 24x24 silhouettes for polish.
 */
export const CategoryIcon = ({ category, size = 22, color = colors.parchment }: Props) => {
  if (!category) return null;
  switch (category) {
    case 'craft':
      return <Ionicons name="cut" size={size} color={color} />;
    case 'fashion':
      return <MaterialCommunityIcons name="hanger" size={size} color={color} />;
    case 'film':
      return <MaterialCommunityIcons name="movie-open-outline" size={size} color={color} />;
    case 'tv':
      return <MaterialCommunityIcons name="monitor" size={size} color={color} />;
    case 'food':
      return <MaterialCommunityIcons name="silverware-fork-knife" size={size} color={color} />;
    case 'art':
      return <MaterialCommunityIcons name="palette" size={size} color={color} />;
    case 'music':
      return <Ionicons name="musical-notes" size={size} color={color} />;
    case 'places':
      return <Ionicons name="location" size={size} color={color} />;
    case 'meme':
      return <Ionicons name="happy" size={size} color={color} />;
    case 'messages':
      return <Ionicons name="chatbubble" size={size} color={color} />;
    case 'shopping':
      return <Ionicons name="bag" size={size} color={color} />;
    case 'reading':
      return <Ionicons name="book" size={size} color={color} />;
    case 'events':
      return <Ionicons name="calendar" size={size} color={color} />;
    case 'tech':
      return <Ionicons name="code-slash" size={size} color={color} />;
    case 'documents':
      return <Ionicons name="document" size={size} color={color} />;
    default:
      return null;
  }
};
