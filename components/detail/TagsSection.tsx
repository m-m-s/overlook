import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '../Chip';
import { Section, SectionHeader, sortedDisplayTags } from './SectionHelpers';
import { formatTagValue, TAG_TYPES } from '@/lib/options';
import type { TypedTag } from '@/lib/screenshots';
import type { FontSet, Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';

type Props = {
  manualTags: TypedTag[];
  aiTags: TypedTag[];
  isEditing: boolean;
  onToggle: () => void;
  newTag: string;
  onNewTagChange: (v: string) => void;
  onAddTag: () => void;
  onRemoveTag: (idx: number) => void;
  onSetTagType: (idx: number, type: string | undefined) => void;
  pendingAmbiguous: { value: string; candidates: string[] } | null;
  onResolveAmbiguous: (type: string | null) => void;
};

export const TagsSection = ({
  manualTags,
  aiTags,
  isEditing,
  onToggle,
  newTag,
  onNewTagChange,
  onAddTag,
  onRemoveTag,
  onSetTagType,
  pendingAmbiguous,
  onResolveAmbiguous,
}: Props) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  const sorted = sortedDisplayTags(manualTags, aiTags);

  return (
    <Section onToggle={onToggle}>
      <SectionHeader label="tags" editing={isEditing} onExit={onToggle} />
      {sorted.length === 0 && !isEditing ? (
        <Text style={styles.emptyHint}>not set</Text>
      ) : (
        <>
          <View style={styles.chipRow}>
            {sorted.map((entry) => {
              const { tag, source, manualIndex } = entry;
              if (source === 'manual') {
                return (
                  <Chip
                    key={`m-${tag.value}-${manualIndex}`}
                    label={tag.type ? `${tag.type}: ${formatTagValue(tag.value)}` : formatTagValue(tag.value)}
                    variant="manual"
                    onPress={
                      isEditing
                        ? () => {
                            const types = [undefined, ...TAG_TYPES] as (string | undefined)[];
                            const cur = types.indexOf(tag.type);
                            const next = types[(cur + 1) % types.length];
                            onSetTagType(manualIndex!, next);
                          }
                        : undefined
                    }
                    onRemove={isEditing ? () => onRemoveTag(manualIndex!) : undefined}
                  />
                );
              }
              return (
                <Chip
                  key={`a-${tag.value}-${entry.aiIndex}`}
                  label={tag.type ? `${tag.type}:${tag.value}` : tag.value}
                  variant="ai"
                />
              );
            })}
          </View>

          {isEditing && (
            <>
              <View style={{ marginTop: 8 }}>
                <BottomSheetTextInput
                  value={newTag}
                  onChangeText={onNewTagChange}
                  onSubmitEditing={onAddTag}
                  placeholder="+ add tag"
                  placeholderTextColor={c.inkMuted}
                  autoCapitalize="none"
                  style={styles.tagInput}
                />
              </View>
              {pendingAmbiguous && (
                <View style={styles.ambiguousRow}>
                  <Text style={styles.ambiguousLabel}>
                    is &quot;{pendingAmbiguous.value}&quot; a…
                  </Text>
                  <View style={styles.chipRow}>
                    {pendingAmbiguous.candidates.map((cand) => (
                      <Chip
                        key={cand}
                        label={cand}
                        variant="meta"
                        color={c.ink}
                        onPress={() => onResolveAmbiguous(cand)}
                      />
                    ))}
                    <Chip
                      label="neither — keep untyped"
                      variant="add"
                      color={c.inkMuted}
                      onPress={() => onResolveAmbiguous(null)}
                    />
                  </View>
                </View>
              )}
            </>
          )}
        </>
      )}
    </Section>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, rowGap: 8 },
    emptyHint: { fontSize: 12, color: c.inkMuted, fontStyle: 'italic' },
    tagInput: {
      fontSize: 13,
      color: c.ink,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.inkMuted,
      borderRadius: 3,
    },
    ambiguousRow: {
      marginTop: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.divider,
      borderRadius: 4,
      gap: 10,
    },
    ambiguousLabel: { fontSize: 12, color: c.ink, fontStyle: 'italic' },
  });
