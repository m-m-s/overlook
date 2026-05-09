import { Ionicons } from '@expo/vector-icons';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import * as Linking from 'expo-linking';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { FontSet, Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';
import type { ActionLink, ActionLinkType, LocalScreenshot } from '@/lib/uploads';

const actionUrlIcon = (
  type: string | null | undefined,
): React.ComponentProps<typeof Ionicons>['name'] => {
  switch (type) {
    case 'profile': return 'person-outline';
    case 'pattern': return 'grid-outline';
    case 'stream': return 'musical-notes-outline';
    case 'video': return 'play-outline';
    case 'maps': return 'map-outline';
    case 'listing': return 'home-outline';
    case 'tickets': return 'ticket-outline';
    case 'directions': return 'navigate-outline';
    case 'buy': return 'bag-outline';
    case 'recipe': return 'restaurant-outline';
    case 'watch': return 'play-outline';
    case 'read': return 'book-outline';
    case 'search': return 'search-outline';
    default: return 'open-outline';
  }
};

/** Guess an action type from a freshly-pasted URL. Mirrors the vision
 *  prompt's enum so user-added URLs land in the same buckets as AI ones. */
const guessLinkType = (raw: string): ActionLinkType => {
  const url = raw.toLowerCase();
  if (url.includes('maps.google') || url.includes('google.com/maps') || url.includes('goo.gl/maps')) return 'maps';
  if (url.includes('instagram.com') || url.includes('tiktok.com') || url.includes('x.com/') || url.includes('twitter.com')) return 'profile';
  if (url.includes('ravelry.com')) return 'pattern';
  if (url.includes('airbnb.com') || url.includes('vrbo.com') || url.includes('zillow.com') || url.includes('streeteasy.com')) return 'listing';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'video';
  if (url.includes('spotify.com') || url.includes('music.apple') || url.includes('soundcloud')) return 'stream';
  if (url.includes('netflix.com') || url.includes('disneyplus') || url.includes('hbomax') || url.includes('hulu.com') || url.includes('max.com')) return 'watch';
  if (url.includes('ticket') || url.includes('eventbrite') || url.includes('partiful') || url.includes('lu.ma')) return 'tickets';
  if (url.includes('amazon.com') || url.includes('etsy.com') || url.includes('shop') || url.includes('product')) return 'buy';
  if (url.includes('recipe') || url.includes('allrecipes') || url.includes('nytimes.com/recipes')) return 'recipe';
  if (url.includes('goodreads') || url.includes('substack') || url.includes('medium.com')) return 'read';
  return 'search';
};

/** Best-effort label from a URL when the user adds one without a label —
 *  show the host without "www." so the pill stays compact. */
const labelFromUrl = (raw: string): string => {
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return u.host.replace(/^www\./, '');
  } catch {
    return raw.length > 24 ? raw.slice(0, 24) + '…' : raw;
  }
};

type Props = {
  item: LocalScreenshot;
  sourceUrl: string | null;
  sourceUrlManual: string | null;
  onSourceChange: (next: string) => void;
  onLinksChange: (next: ActionLink[]) => void;
};

/**
 * Compact links row — shows the source URL (read-only) + every action_url
 * (AI or manual) as small icon pills in a horizontal scroll. Tap a pill
 * to open the URL. Long-press a manual pill to remove it. The trailing
 * "+ Add" pill toggles a Modal for adding a custom link.
 */
export const LinksSection = ({
  item,
  sourceUrl,
  sourceUrlManual,
  onSourceChange,
  onLinksChange,
}: Props) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingSource, setEditingSource] = useState(false);
  const [sourceDraft, setSourceDraft] = useState(sourceUrlManual ?? '');

  const links = item.actionUrls ?? [];

  const commitDraft = () => {
    const url = draft.trim();
    if (!url) {
      setAdding(false);
      return;
    }
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const next: ActionLink[] = [
      ...links,
      {
        url: fullUrl,
        type: guessLinkType(url),
        label: labelFromUrl(url),
        source: 'manual',
      },
    ];
    onLinksChange(next);
    setDraft('');
    setAdding(false);
  };

  const removeAt = (idx: number) => {
    const target = links[idx];
    if (!target || target.source !== 'manual') return;
    const next = links.filter((_, i) => i !== idx);
    onLinksChange(next);
  };

  const open = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>links</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {sourceUrl && (
          <Pressable
            onPress={() => open(sourceUrl)}
            onLongPress={() => setEditingSource((v) => !v)}
            style={styles.pill}
          >
            <Ionicons name="globe-outline" size={14} color={c.ink} />
            <Text style={styles.pillLabel} numberOfLines={1}>
              {labelFromUrl(sourceUrl)}
            </Text>
          </Pressable>
        )}

        {links.map((link, i) => (
          <Pressable
            key={`${link.url}-${i}`}
            onPress={() => open(link.url)}
            onLongPress={link.source === 'manual' ? () => removeAt(i) : undefined}
            delayLongPress={350}
            style={[styles.pill, link.source === 'manual' && styles.pillManual]}
          >
            <Ionicons name={actionUrlIcon(link.type)} size={14} color={c.ink} />
            <Text style={styles.pillLabel} numberOfLines={1}>
              {link.label || link.type}
            </Text>
          </Pressable>
        ))}

        <Pressable onPress={() => setAdding(true)} style={[styles.pill, styles.pillAdd]}>
          <Ionicons name="add" size={14} color={c.inkMuted} />
          <Text style={[styles.pillLabel, { color: c.inkMuted }]}>Add link</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={adding}
        transparent
        animationType="fade"
        onRequestClose={() => setAdding(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.addLinkOverlay}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setAdding(false)}
            accessibilityLabel="Close"
          />
          <View style={styles.addLinkCard}>
            <Text style={styles.addLinkHeading}>Add link</Text>
            <Text style={styles.addLinkHint}>
              Paste any URL — Instagram, Maps, Spotify, anywhere.
            </Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="https://"
              placeholderTextColor={c.inkMuted}
              autoCapitalize="none"
              keyboardType="url"
              autoFocus
              onSubmitEditing={commitDraft}
              style={styles.addLinkInput}
            />
            <View style={styles.addLinkBtns}>
              <Pressable onPress={() => setAdding(false)} style={styles.addLinkCancel}>
                <Text style={styles.addLinkCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={commitDraft}
                disabled={!draft.trim()}
                style={[styles.addLinkPrimary, !draft.trim() && { opacity: 0.4 }]}
              >
                <Text style={styles.addLinkPrimaryText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {editingSource && (
        <View style={styles.sourceEditor}>
          <BottomSheetTextInput
            value={sourceDraft}
            onChangeText={setSourceDraft}
            onBlur={() => {
              if (sourceDraft !== (sourceUrlManual ?? '')) {
                onSourceChange(sourceDraft);
              }
              setEditingSource(false);
            }}
            placeholder="override source URL"
            placeholderTextColor={c.inkMuted}
            autoCapitalize="none"
            keyboardType="url"
            style={styles.sourceInput}
          />
        </View>
      )}
    </View>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    wrap: { paddingTop: 6 },
    heading: {
      fontSize: 11,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginTop: 8,
      marginBottom: 6,
    },
    row: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingRight: 8 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.ink,
      backgroundColor: c.parchment,
      maxWidth: 200,
    },
    pillManual: {
      backgroundColor: c.ink,
    },
    pillAdd: {
      borderStyle: 'dashed',
      borderColor: c.inkMuted,
    },
    pillLabel: {
      fontFamily: f.body,
      fontSize: 12,
      letterSpacing: 0.2,
      color: c.ink,
    },
    sourceEditor: { marginTop: 8 },
    sourceInput: {
      fontFamily: f.body,
      fontSize: 13,
      color: c.ink,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.inkMuted,
      borderRadius: 4,
    },
    addLinkOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    addLinkCard: {
      backgroundColor: c.parchment,
      borderRadius: 8,
      padding: 20,
      gap: 10,
    },
    addLinkHeading: {
      fontFamily: f.displayMedium,
      fontSize: 20,
      color: c.ink,
      letterSpacing: -0.4,
    },
    addLinkHint: {
      fontFamily: f.body,
      fontSize: 13,
      color: c.inkSoft,
      lineHeight: 19,
    },
    addLinkInput: {
      fontFamily: f.body,
      fontSize: 14,
      color: c.ink,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.ink,
      borderRadius: 4,
      marginTop: 4,
    },
    addLinkBtns: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 6,
    },
    addLinkCancel: {
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    addLinkCancelText: {
      fontSize: 13,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.inkMuted,
    },
    addLinkPrimary: {
      backgroundColor: c.ink,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 4,
    },
    addLinkPrimaryText: {
      color: c.parchment,
      fontSize: 13,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
  });
