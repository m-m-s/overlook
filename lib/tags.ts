/**
 * Single source of truth for the typed-tag shape. Lives in its own module
 * so both `lib/uploads.ts` and `lib/screenshots.ts` (which form a circular
 * dep otherwise) can import from a leaf.
 */
export type TypedTag = {
  type?: string;
  value: string;
};
