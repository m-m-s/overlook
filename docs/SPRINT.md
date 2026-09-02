# Sprint scope (active)

This document defines the **active scope** for the current sprint. It overrides CLAUDE.md where they conflict. CLAUDE.md remains the durable project spec; SPRINT.md is temporary and will be removed when the sprint ends.

**Account note:** Max plan ends [FILL IN DATE]. After that, work continues on Pro (different account, no session memory). All decisions, prompts, and gotchas must be captured in CLAUDE.md, SPRINT.md, or NOTES.md before the switch. Nothing important lives only in chat history.

We have ~36 hours of grind time before the Max plan ends. Hard scope cuts for this sprint:

## Shipping (Phase 1 + Phase 2 from CLAUDE.md)

- Expo + Supabase + auth (magic link, not OAuth)
- Library grid, card component per `overlook-cards-v5.html`, bottom sheet per `overlook-bottomsheet.html`
- Manual tagging with typed tags
- Supabase sync
- Bulk upload + Vercel + Claude vision (prompt already tested separately)
- Filter chips (top of grid, Supabase queries — no Fuse.js, no sidebar)
- EAS production APK at the end

## Cutting from spec for this sprint, do not build

- FileObserver / post-screenshot popup (entire Phase 3)
- Triage swipe interface (Phase 5)
- Home page category rows (Phase 5)
- Fuse.js search (defer to filter chips only)
- Sidebar swipe gesture (Phase 4)
- Themes, redaction, onboarding (Phase 6)
- Pinch-to-zoom column switching — pick 3 columns, ship it
- Difficulty, time_to_complete, source_url, action_url fields — vision prompt returns only `{typed_tags, category, subject, urgency, urgency_date}` for v1
- Device-only image storage — upload images to Supabase Storage for sprint, migrate later

## Working agreement

- Commit after every working step, small commits, descriptive messages
- When something works ugly, leave it ugly — no refactoring during sprint
- If you're stuck >20 min on something non-core (auth weirdness, Expo config, styling fight), tell me and propose a cut
- Use plan mode before any architectural decision; just execute on component scaffolds and API routes
- Reference `overlook-*.html` mockups directly when building visual components

## Today's goal

End-to-end loop working — pick image → upload → display in flat grid. Ugly is fine.

## Tomorrow

Card design, vision API, bulk upload, filters, APK.
