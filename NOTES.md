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

- **2026-05-07** ~~Card edge bleed: vertical fade omitted~~ — false deviation; re-read of spec says `linear-gradient(to right, ...)` only. Horizontal gradient is correct. Adjusted band height down for a more "bleed" feel.
- **2026-05-07** Category icons use @expo/vector-icons. Originally mixed Material + Ionicons (inconsistent stroke weight) — switched to single library (Ionicons) for visual consistency. Hand-drawn 24x24 silhouettes per spec deferred (15+ icons, polish).
- **2026-05-07** First Anthropic API key leaked in chat → rotated immediately. Always paste API keys directly into Vercel/Supabase dashboards, never into Claude Code chat (chat is logged).
- **2026-05-07** Image picker capped at 10 per pick (selectionLimit: 10) — guards against 20+ parallel base64 reads + Vercel calls overwhelming the phone process. Bulk-import flow per CLAUDE.md is a separate UX (not in sprint).

## Prompt versions (Claude vision)

(empty — paste tested prompt here when adding to Vercel function)

## Env vars needed (names only — values in .env, never committed)

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- (Vercel side, not in app) `ANTHROPIC_API_KEY`
- (Vercel side) `SUPABASE_SERVICE_ROLE_KEY` if functions need server-side writes

## How Maggie wants to collaborate (also in claude memory; copying here so it survives the account switch)

- First mobile app, first time with most of this stack. Knows basic git + can run commands, may not understand them.
- Explain plain English *before* running things.
- Run git commands for her, don't hand them off.
- For anything outside code (Supabase dashboard, Vercel UI, env vars, phone taps): step-by-step numbered instructions.
- If she signals confusion, stop and explain — don't steamroll.
- **Teach as you go.** After non-trivial code/config changes, briefly explain what the new code does and why this approach over alternatives. 2-4 sentences max.
- **Follow the spec.** Default to spec compliance (CLAUDE.md, SPRINT.md, mockups). Deviations need a real reason (technical constraint, sprint cut). Don't quietly take "sprint speed" shortcuts that aren't justified.
- **Keep building.** Less than 48h on the sprint clock (minus sleep + commute). Bias toward action — only stop to ask when undoing would be harder than building. Add things, run the type-check, commit, push, move on.
- **Keep deepening.** When something has ranged data (dictionary entries, prompt content, options lists), don't ship the minimum-viable and call it done. Expand iteratively as time allows. Maggie will notice if something feels shallow at the end.
- **Don't ask, just go.** Make reasonable choices and document them here in NOTES.md. Only pause for genuine blockers (undoable actions, truly missing info you can't reasonably guess). When a body of work is complete, run a final check (type-check, lint, expo doctor) and report a status summary.

## Phone-test debugging tips

- **Magic link "dimmed screen" / "site can't be reached":** the link redirected to `localhost:3000` because Supabase's default Site URL is set there AND our `exp://*` allowlist wildcard didn't actually match. Per Supabase wildcard rules, `*` matches one segment only (no `/`), so `exp://*` doesn't match `exp://192.168.1.5:8081/--/...`. Use `exp://**` (double asterisk) to match across slashes. Or — preferred — use the 6-digit OTP code path so deep linking is irrelevant.
- **OTP code path requires `{{ .Token }}` in Supabase email template:** Auth → Email Templates → Magic Link. Default template only has the link, not the code.
- **Reload app code on phone:** Shake the phone (literally — accelerometer trigger) → tap **Reload**, OR press `r` in the `npx expo start` terminal.
- **First bundling takes ~1-2 min in Expo Go.** Subsequent reloads are faster (Metro caches).
- **Phone needs same WiFi as Mac** running `npx expo start`. If on different networks, use `npx expo start --tunnel` (slower, more reliable).
- **No background work between Claude turns:** Claude only runs during a message-response cycle. When the user is offline (sleep, commute), no code is being written. Plan sprint time accordingly.

## Shallow-implementation watchlist (deepen iteratively)

- **AI vision prompt** in `server/api/analyze.ts` is a baseline I wrote, NOT Maggie's tested prompt. Swap when she pastes it.
- **Built-in tag dictionary** in `lib/tagDictionary.ts` is at ~450 entries; could grow to 1000+ for more coverage. Common gaps: brand names (source type), more food items, more home decor items.
- **Empty states / error messages** are minimal. Could be warmer, more specific.
- **Onboarding hints** (per CLAUDE.md gesture-discoverability section) entirely deferred.

## Things to remember before the account switch

- Move both `~/.claude/projects/.../memory/project_overlook*.md` files into project repo (paste relevant contents into CLAUDE.md or NOTES.md). Claude memory does not survive the account switch.
- Make sure Anthropic API key for Vercel is from a billing account that survives the switch (not tied to the Max plan).
- Capture working magic-link redirect config in NOTES.md once it works — undocumented combinations of `app.json` scheme + Supabase redirect allowlist are easy to lose.
