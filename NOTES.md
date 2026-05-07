# Notes

Running scratchpad of decisions, gotchas, prompt versions, and anything else not in CLAUDE.md / SPRINT.md. Survives the Max → Pro account switch; chat history does not.

## Decisions

- **2026-05-07** Initialized via `create-expo-app@latest --template default` → Expo SDK 54, Expo Router 6, RN 0.81, React 19. Template default ships with `(tabs)` layout — we'll flatten it for sprint since spec calls for no nav bar.
- **2026-05-07** Auth = magic link per SPRINT.md. Fallback if it goes >20 min: email+password.
- **2026-05-07** Storage = Supabase Storage for sprint (overrides CLAUDE.md device-only). Migrate later.
- **2026-05-07** Vision API returns only `{typed_tags, category, subject, urgency, urgency_date}` for sprint. Difficulty / time_to_complete / source_url / action_url all deferred.
- **2026-05-07** AsyncStorage for Supabase auth session (per Supabase RN docs). Could harden to expo-secure-store later.
- **2026-05-07** Path B (FileObserver) reverted → cut entirely from sprint. Manual gallery import is the only entry point in v1.

## Gotchas to capture as we hit them

(empty — will fill in)

## Prompt versions (Claude vision)

(empty — paste tested prompt here when adding to Vercel function)

## Env vars needed (names only — values in .env, never committed)

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- (Vercel side, not in app) `ANTHROPIC_API_KEY`
- (Vercel side) `SUPABASE_SERVICE_ROLE_KEY` if functions need server-side writes

## Things to remember before the account switch

- Move both `~/.claude/projects/.../memory/project_overlook*.md` files into project repo (paste relevant contents into CLAUDE.md or NOTES.md). Claude memory does not survive the account switch.
- Make sure Anthropic API key for Vercel is from a billing account that survives the switch (not tied to the Max plan).
- Capture working magic-link redirect config in NOTES.md once it works — undocumented combinations of `app.json` scheme + Supabase redirect allowlist are easy to lose.
