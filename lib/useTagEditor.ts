import { useEffect, useState } from 'react';
import { fetchScreenshotMeta, updateScreenshot, type TypedTag } from './screenshots';
import { buildTagFromValue, rememberTagType } from './tagDictionary';
import type { LocalScreenshot } from './uploads';

type Session = { user: { id: string } } | null;
type Toast = { error: (msg: string) => void };

export const useTagEditor = (
  item: LocalScreenshot,
  session: Session,
  onChange: (patch: Partial<LocalScreenshot>) => void,
  onServerNotes: (notes: string) => void,
  toast: Toast,
) => {
  const [manualTags, setManualTags] = useState<TypedTag[]>([]);
  const [aiTags, setAiTags] = useState<TypedTag[]>([]);
  const [aiSubjects, setAiSubjects] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [pendingAmbiguous, setPendingAmbiguous] = useState<{ value: string; candidates: string[] } | null>(null);

  useEffect(() => {
    if (!session) return;
    fetchScreenshotMeta(item.id).then((meta) => {
      if (!meta) return;
      setManualTags(meta.manual_typed_tags);
      setAiTags(meta.ai_typed_tags);
      setAiSubjects(meta.ai_suggested_subjects);
      onServerNotes(meta.notes ?? '');
    });
    if ((item.aiTags?.length ?? 0) > 0 && item.aiReviewed === false) {
      void updateScreenshot(item.id, { ai_reviewed: true });
      onChange({ aiReviewed: true });
    }
  // onServerNotes is a stable setState setter — safe to omit from deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, session, item.aiTags, item.aiReviewed, onChange]);

  const persistTags = (updated: TypedTag[]) => {
    const { error } = updateScreenshot(item.id, { manual_typed_tags: updated }) as unknown as { error: string | null };
    if (error) toast.error(`Save failed: ${String(error).slice(0, 80)}`);
  };

  const commitTag = (tag: TypedTag) => {
    const updated = [...manualTags, tag];
    setManualTags(updated);
    setNewTag('');
    setPendingAmbiguous(null);
    void updateScreenshot(item.id, { manual_typed_tags: updated });
  };

  const addTag = async () => {
    const v = newTag.trim();
    if (!v) return;
    const result = await buildTagFromValue(v);
    if ('ambiguous' in result) {
      setPendingAmbiguous({ value: result.value, candidates: result.candidates });
      return;
    }
    commitTag(result);
  };

  const resolveAmbiguous = (type: string | null) => {
    if (!pendingAmbiguous) return;
    const tag: TypedTag = type ? { type, value: pendingAmbiguous.value } : { value: pendingAmbiguous.value };
    if (type) void rememberTagType(pendingAmbiguous.value, type);
    commitTag(tag);
  };

  const removeTag = (idx: number) => {
    const updated = manualTags.filter((_, i) => i !== idx);
    setManualTags(updated);
    persistTags(updated);
  };

  const setTagType = (idx: number, type: string | undefined) => {
    const updated = manualTags.map((t, i) => (i === idx ? { ...t, type } : t));
    setManualTags(updated);
    persistTags(updated);
    if (type) void rememberTagType(manualTags[idx].value, type);
  };

  return {
    manualTags, aiTags, aiSubjects,
    newTag, setNewTag,
    pendingAmbiguous,
    addTag, removeTag, setTagType, resolveAmbiguous,
  };
};
