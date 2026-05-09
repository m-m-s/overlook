import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from './Card';
import type { CardData } from './Card';
import { statusColors, urgencyColors, type FontSet, type Palette } from '@/lib/colors';
import { heavyHaptic } from '@/lib/haptics';
import { useColors, useFonts } from '@/lib/themeContext';
import type { LocalScreenshot } from '@/lib/uploads';

const toCardData = (it: LocalScreenshot): CardData => ({
  id: it.id,
  uri: it.uri,
  category: it.category ?? null,
  status: (it.status as keyof typeof statusColors) ?? null,
  urgency: (it.urgency as keyof typeof urgencyColors) ?? null,
  resonance: it.resonance ?? null,
});

type Props = {
  title: string;
  /** Number rendered next to the title. Usually items.length, but the
   *  caller can override (e.g. when items has been .slice'd for display). */
  count: number;
  items: LocalScreenshot[];
  /** Width of each card cell — passed in so home can match its current
   *  pinch-zoom column count. */
  cellWidth: number;
  /** Ids of screenshots currently queued for AI analysis — drives the
   *  small badge on the card. */
  queuedIds: Set<string>;
  onCardPress: (it: LocalScreenshot) => void;
  onSeeAll: () => void;
  /** Cap the rendered list. Some rows show top-30 (categories, pinned).
   *  Defaults to all items. */
  maxItems?: number;
  /** When true, disable horizontal scroll — used during a pinch gesture
   *  on the parent so the FlatList doesn't fight the pinch handler. */
  scrollLocked?: boolean;
  /** Untagged-style dimmed cards (opacity 0.65). */
  dimmed?: boolean;
  /** Optional message rendered when items is empty (e.g. pinned filter
   *  with no matches). When omitted, an empty row hides itself by
   *  rendering nothing — the parent should gate on items.length. */
  emptyMessage?: string;
  /** Reorder-mode hooks. Long-press the title to enter reorder mode at
   *  the parent; the X icon hides this row from home. */
  onTitleLongPress?: () => void;
  reorderMode?: boolean;
  onHide?: () => void;
  /** Secondary link to the LEFT of "see all" — e.g. triage shortcut on
   *  the untagged row. */
  onSecondary?: () => void;
  secondaryLabel?: string;
};

/**
 * Single horizontal-scroll row used for every home-page section: urgent,
 * "what's next", category rows, pinned saved-filter rows, recently added,
 * untagged. Each variant is just different `items` + props.
 *
 * The parent decides WHAT to show (filter screenshots by category, by
 * urgency keys, by saved-filter criteria); this component just renders
 * the chosen list with consistent header + card layout.
 */
export const HomeRow = ({
  title,
  count,
  items,
  cellWidth,
  queuedIds,
  onCardPress,
  onSeeAll,
  maxItems,
  scrollLocked,
  dimmed,
  emptyMessage,
  onTitleLongPress,
  reorderMode,
  onHide,
  onSecondary,
  secondaryLabel,
}: Props) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  const data = maxItems != null ? items.slice(0, maxItems) : items;

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Pressable
          onLongPress={() => {
            if (onTitleLongPress) {
              void heavyHaptic();
              onTitleLongPress();
            }
          }}
          delayLongPress={250}
          hitSlop={6}
        >
          <Text style={styles.rowTitle}>{title}</Text>
        </Pressable>
        <Text style={styles.rowCount}>{count}</Text>
        <View style={{ flex: 1 }} />
        {reorderMode ? (
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            {onHide && (
              <Pressable
                onPress={onHide}
                hitSlop={8}
                accessibilityLabel={`Remove ${title} row from home`}
              >
                <Ionicons name="close" size={18} color={c.inkMuted} />
              </Pressable>
            )}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {onSecondary && (
              <Pressable onPress={onSecondary} hitSlop={6}>
                <Text style={styles.rowSeeAll}>{secondaryLabel ?? 'open ›'}</Text>
              </Pressable>
            )}
            <Pressable onPress={onSeeAll} hitSlop={6}>
              <Text style={styles.rowSeeAll}>see all ›</Text>
            </Pressable>
          </View>
        )}
      </View>
      {data.length === 0 && emptyMessage ? (
        <Text style={styles.emptyMessage}>{emptyMessage}</Text>
      ) : (
        <FlatList
          horizontal
          scrollEnabled={!scrollLocked}
          data={data}
          keyExtractor={(it) => it.id}
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ width: 3 }} />}
          contentContainerStyle={styles.rowList}
          renderItem={({ item }) => (
            <View
              style={[
                styles.rowCell,
                dimmed ? styles.rowCellDim : null,
                { width: cellWidth },
              ]}
            >
              <Card
                data={toCardData(item)}
                queued={queuedIds.has(item.id)}
                onPress={() => onCardPress(item)}
              />
            </View>
          )}
        />
      )}
    </View>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    row: { marginBottom: 20 },
    rowHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      paddingBottom: 8,
      marginBottom: 8,
      gap: 8,
      marginHorizontal: 20,
    },
    rowTitle: {
      fontFamily: f.displayMedium,
      fontSize: 22,
      color: c.ink,
      letterSpacing: -0.3,
      textTransform: 'capitalize',
    },
    rowCount: {
      fontFamily: f.italic,
      fontSize: 14,
      color: c.inkMuted,
    },
    rowSeeAll: {
      fontSize: 11,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: c.inkMuted,
    },
    rowList: { paddingHorizontal: 0 },
    rowCell: { aspectRatio: 1 },
    rowCellDim: { opacity: 0.65 },
    emptyMessage: {
      fontFamily: f.italic,
      fontSize: 14,
      color: c.inkMuted,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
  });
