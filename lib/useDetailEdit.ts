import { useCallback, useEffect, useState } from 'react';
import { LayoutAnimation } from 'react-native';
import { dropFromAnalysisQueue } from './analysisQueue';
import { emptyFilters, type Filters } from './filters';
import { useFilters } from './filtersContext';
import { successHaptic } from './haptics';
import { updateScreenshot } from './screenshots';
import { computeUrgencyDate } from './urgency';
import type { LocalScreenshot } from './uploads';
import type { Category } from '@/components/CategoryIcon';

const LOCAL_ONLY_DEFAULT_CATEGORIES = new Set(['documents', 'messages']);

export type Pending = Partial<{
  category: string | null;
  categories: string[];
  subject: string | null;
  urgency: string | null;
  urgencyDate: string | null;
  status: string | null;
  resonance: 1 | 2 | 3 | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  timeToComplete: 'quick' | 'afternoon' | 'full_day' | 'multi_day' | 'long_term' | null;
  sourceUrlManual: string | null;
  notes: string | null;
  localOnly: boolean;
}>;

type Toast = { error: (msg: string) => void };

export const useDetailEdit = (
  item: LocalScreenshot,
  serverNotes: string,
  onChange: (patch: Partial<LocalScreenshot>) => void,
  onClose: (() => void) | undefined,
  toast: Toast,
) => {
  const { setFilters } = useFilters();
  const [pending, setPending] = useState<Pending>({});
  const [editingSections, setEditingSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPending({});
    setEditingSections(new Set());
  }, [item.id]);

  const itemCategories: string[] =
    item.categories && item.categories.length > 0
      ? item.categories
      : item.category ? [item.category] : [];

  const view = {
    category: 'category' in pending ? pending.category : item.category,
    categories: 'categories' in pending ? (pending.categories ?? []) : itemCategories,
    subject: 'subject' in pending ? pending.subject : item.subject,
    urgency: 'urgency' in pending ? pending.urgency : item.urgency,
    status: 'status' in pending ? pending.status : item.status,
    resonance: 'resonance' in pending ? pending.resonance : item.resonance,
    difficulty: 'difficulty' in pending ? pending.difficulty : item.difficulty ?? null,
    timeToComplete: 'timeToComplete' in pending ? pending.timeToComplete : item.timeToComplete ?? null,
    sourceUrlManual: 'sourceUrlManual' in pending ? pending.sourceUrlManual : item.sourceUrlManual ?? null,
    notes: 'notes' in pending ? pending.notes : serverNotes,
    localOnly: 'localOnly' in pending ? pending.localOnly : item.localOnly ?? false,
  };

  const stage = (patch: Pending) => setPending((prev) => ({ ...prev, ...patch }));

  const isEditing = (key: string) => editingSections.has(key);

  const toggleEditing = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditingSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const closeAllEditing = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditingSections(new Set());
  }, []);

  const filterBy = useCallback((patch: Partial<Filters>) => {
    setFilters({ ...emptyFilters(), ...patch });
    onClose?.();
  }, [setFilters, onClose]);

  const setCategory = (cat: Category | null) => {
    if (!cat) { stage({ category: null, categories: [] }); return; }
    const has = view.categories.includes(cat);
    const nextCategories = has ? view.categories.filter((x) => x !== cat) : [...view.categories, cat];
    const updates: Pending = { categories: nextCategories, category: nextCategories[0] ?? null };
    if (!has && LOCAL_ONLY_DEFAULT_CATEGORIES.has(cat) && !view.localOnly) updates.localOnly = true;
    stage(updates);
  };

  const setStatus = (s: string | null) => stage({ status: view.status === s ? null : s });

  const setUrgency = (u: string | null) => {
    const next = view.urgency === u ? null : u;
    stage({ urgency: next, urgencyDate: next ? computeUrgencyDate(next) : null });
  };

  const setResonance = (r: 1 | 2 | 3 | null) => stage({ resonance: view.resonance === r ? null : r });

  const onApply = async (onNotesSaved?: (notes: string | null) => void) => {
    const patch = pending;
    if (Object.keys(patch).length === 0) { closeAllEditing(); return; }
    void successHaptic();

    const dbPatch: Record<string, unknown> = {};
    if ('category' in patch) dbPatch.category = patch.category;
    if ('categories' in patch) dbPatch.categories = patch.categories;
    if ('subject' in patch) dbPatch.subject = patch.subject;
    if ('urgency' in patch) dbPatch.urgency = patch.urgency;
    if ('urgencyDate' in patch) dbPatch.urgency_date = patch.urgencyDate;
    if ('status' in patch) dbPatch.status = patch.status;
    if ('resonance' in patch) dbPatch.resonance = patch.resonance;
    if ('difficulty' in patch) dbPatch.difficulty = patch.difficulty;
    if ('timeToComplete' in patch) dbPatch.time_to_complete = patch.timeToComplete;
    if ('sourceUrlManual' in patch) dbPatch.source_url_manual = patch.sourceUrlManual;
    if ('notes' in patch) dbPatch.notes = patch.notes;
    if ('localOnly' in patch) dbPatch.local_only = patch.localOnly;

    onChange(patch as Partial<LocalScreenshot>);
    if ('notes' in patch) onNotesSaved?.(patch.notes ?? null);
    setPending({});
    closeAllEditing();

    const { error } = await updateScreenshot(
      item.id,
      dbPatch as Parameters<typeof updateScreenshot>[1],
    );
    if (error) {
      setPending(patch);
      toast.error(`Save failed: ${error.slice(0, 80)}`);
      return;
    }
    if (patch.localOnly === true) void dropFromAnalysisQueue(item.id);
  };

  return {
    pending, view, stage, editingSections, isEditing, toggleEditing, closeAllEditing,
    setEditingSections, setCategory, setStatus, setUrgency, setResonance,
    onApply, filterBy,
  };
};
