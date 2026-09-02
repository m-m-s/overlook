import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '../Chip';
import { CategoryIcon, type Category } from '../CategoryIcon';
import { Shake } from '../Shake';
import { SectionHeader } from './SectionHelpers';
import { capitalize, CATEGORIES } from '@/lib/options';
import type { FontSet, Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  categories: string[];
  category: string | null | undefined;
  subject: string | null | undefined;
  aiSubjects: string[];
  isEditingCategory: boolean;
  isEditingSubject: boolean;
  onToggleCategory: () => void;
  onToggleSubject: () => void;
  onSetCategory: (cat: Category | null) => void;
  onStageSubject: (s: string | null) => void;
  onApply?: () => void;
};

export const CategorySubjectSection = ({
  categories,
  category,
  subject,
  aiSubjects,
  isEditingCategory,
  isEditingSubject,
  onToggleCategory,
  onToggleSubject,
  onSetCategory,
  onStageSubject,
  onApply,
}: Props) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  return (
    <>
      {/* Breadcrumb — shown when not editing and at least one value is set.
          Tapping any part enters edit mode for that field. */}
      {!isEditingCategory && !isEditingSubject && (categories.length > 0 || subject) && (
        <View style={styles.breadcrumb}>
          {categories.map((cat) => (
            <Pressable key={cat} onPress={onToggleCategory} hitSlop={6} style={({ pressed }) => pressed && { opacity: 0.75 }}>
              <Chip
                label={capitalize(cat)}
                variant="meta"
                selected
                color={c.ink}
                leading={<CategoryIcon category={cat} size={14} color={c.parchment} />}
              />
            </Pressable>
          ))}
          {categories.length > 0 && subject && (
            <Ionicons name="chevron-forward" size={14} color={c.inkMuted} />
          )}
          {subject && (
            <Pressable onPress={onToggleSubject} hitSlop={6} style={({ pressed }) => pressed && { opacity: 0.75 }}>
              <Text style={styles.breadcrumbSubject}>{subject}</Text>
            </Pressable>
          )}
          {categories.length > 0 && !subject && (
            <Pressable onPress={onToggleSubject} hitSlop={6} style={({ pressed }) => pressed && { opacity: 0.75 }}>
              <Text style={styles.breadcrumbAddTitle}>+ add title</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Category edit — only when editing or nothing is set */}
      {(isEditingCategory || (!category && !subject)) && (
        <View>
          <SectionHeader label="category" editing={isEditingCategory} onExit={onApply ?? onToggleCategory} onToggle={onToggleCategory} showAdd={!isEditingCategory && categories.length === 0} />
          {isEditingCategory ? (
            <Shake trigger={isEditingCategory} style={styles.chipRow}>
              {CATEGORIES.map((cat) => {
                const active = categories.includes(cat);
                return (
                  <Chip
                    key={cat}
                    label={capitalize(cat)}
                    selected={active}
                    variant="meta"
                    onPress={() => onSetCategory(cat)}
                    color={active ? c.ink : c.inkMuted}
                    leading={
                      <CategoryIcon
                        category={cat}
                        size={14}
                        color={active ? c.parchment : c.inkMuted}
                      />
                    }
                  />
                );
              })}
            </Shake>
          ) : null}
        </View>
      )}

      {/* Subject edit — only when editing or nothing is set */}
      {(isEditingSubject || (!subject && !category)) && (
        <View>
          <SectionHeader label="subject" editing={isEditingSubject} onExit={onApply ?? onToggleSubject} onToggle={onToggleSubject} showAdd={!isEditingSubject && !subject} />
          {isEditingSubject ? (
            <>
              {aiSubjects.length > 0 && !subject && (
                <View style={[styles.chipRow, { marginBottom: 8 }]}>
                  {aiSubjects.map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      variant="ai"
                      color={c.inkMuted}
                      onPress={() => onStageSubject(s)}
                    />
                  ))}
                </View>
              )}
              <BottomSheetTextInput
                value={subject ?? ''}
                onChangeText={(t) => onStageSubject(t || null)}
                placeholder="specific thing — Crochet, React hook, Italian restaurant…"
                placeholderTextColor={c.inkMuted}
                style={styles.subjectInput}
              />
            </>
          ) : null}
        </View>
      )}
    </>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    breadcrumb: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 12,
      marginBottom: 6,
      flexWrap: 'wrap',
    },
    breadcrumbSubject: { fontFamily: f.displayMedium, fontSize: 17, color: c.ink },
    breadcrumbAddTitle: {
      fontFamily: f.body,
      fontSize: 13,
      color: c.inkMuted,
      borderBottomWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.inkMuted,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, rowGap: 8 },
    subjectInput: {
      fontSize: 16,
      fontFamily: f.displayMedium,
      color: c.ink,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
      borderColor: c.ink,
    },
  });
