# Notes

Running scratchpad of decisions, gotchas, prompt versions, and anything else not in CLAUDE.md / SPRINT.md. Survives the Max → Pro account switch; chat history does not.

## Methodology — spec-driven development (portfolio case study)

This project is built **spec-first**. Before writing any code, I wrote a complete product spec in [CLAUDE.md](CLAUDE.md) — every screen, every gesture, every category, every status/urgency value, every visual rule (parchment palette, dashed underlines, 4:5 grid card ratio, sharp corners on thumbnails, etc.). The spec is the source of truth; the code adapts to it, not the other way around.

The AI assistant (Claude Code) reads CLAUDE.md on every session and treats deviations as bugs unless I explicitly justify them. That makes long autonomous build blocks reliable: I can describe what I want in spec terms (“add an Add to calendar pill to the urgency row when urgency_date is set”) and the implementation lands without re-litigating the design language each time.

**Why this matters for the case study:**

- **Decisions are documented before they get blurry.** Every visual + interaction call (why card thumbnails are square-not-rounded, why typed tags instead of flat tags, why the resonance iris instead of stars, why intent was deleted as a tagging dimension, etc.) is in the spec with the alternatives I considered and the reason I picked one — see "Design decision log" near the bottom of CLAUDE.md. That's portfolio gold: it shows the *thinking*, not just the artifact.
- **Drift gets caught.** When AI-generated code deviates ("you used `c.divider` for a dashed border but spec says hairline + ink"), it shows up immediately as a spec violation rather than slowly diluting the design language across files.
- **Refactors stay safe.** When I refactored the bottom card three times in this session, I could re-read the spec for "what should the bottom sheet do" and re-derive the right architecture instead of remembering implementation details.
- **Onboarding for new collaborators (or future-me) is one file.** Anyone reading the project — Claude in a fresh session, a code reviewer, a future portfolio reader — gets the full mental model from CLAUDE.md without sifting through commits.

**Workflow shape:**

1. **Spec** in CLAUDE.md (product + design + tagging system + gesture map + data model)
2. **Sprint scope** in SPRINT.md (what to ship now, what's deferred, what's intentionally cut)
3. **Implementation** — AI assistant + me, treating the spec as the contract
4. **Decisions log** at the bottom of CLAUDE.md captures any spec evolution mid-build, so the spec stays a living document instead of a stale artifact

This is the methodology to highlight in the portfolio case study: not "I built an app with AI" but "I designed a product with enough rigor that AI could implement it without me re-deciding the design language at every step."

## Session 2026-05-08 → 2026-05-09 — features + major bottom-card refactor

### Shipped (features)

- **Notification deep-link** — tapping the new-screenshot push surfaces that exact asset in the popup. ([lib/screenshotWatcher.tsx](lib/screenshotWatcher.tsx))
- **Calendar integration** — when AI extracts a date (`urgency_date`), an "Add to calendar" pill appears on the urgency row. Android uses the system intent (no permission needed); iOS uses expo-calendar with permission. ([lib/calendar.ts](lib/calendar.ts))
- **Find similar** — tag-weighted "more like this" thumbnail row in card detail. Tap to swap to that screenshot in-place. ([components/detail/SimilarRow.tsx](components/detail/SimilarRow.tsx))
- **Triage swipe gestures** — right=save, left=skip, up=delete on the card image. Buttons remain as fallback. ([app/triage.tsx](app/triage.tsx))
- **Lightbox swipe-away dismissal** — swipe in any direction past 120px or velocity 800 closes the fullscreen image. Plus an explicit X close button in the corner. ([components/ZoomableImage.tsx](components/ZoomableImage.tsx))

### Shipped (fixes)

- **Replay welcome flow** — was silently re-marked complete on next launch when a session existed. Drop the shortcut. ([app/_layout.tsx](app/_layout.tsx))
- **Calendar import crashed Expo Go** — `expo-calendar` is a native module not bundled in Expo Go; importing it at module top crashed the Android bundle. Now lazy-required only in the iOS branch. ([lib/calendar.ts](lib/calendar.ts))
- **Bottom card overflow + grid bleeding through nav** — sheet was `bottomInset=insets.bottom` which left a translucent gap below the sheet showing the dimmed grid. Now `bottomInset=0` and the inner scroll pads itself. Parchment paints under the gesture nav, footer + chips stay above. ([components/DetailSheetHost.tsx](components/DetailSheetHost.tsx))

### Shipped (refactors)

- **`<DetailSheetHost>`** — single source for the screenshot detail sheet. Snap points, backdrop, insets, prev/next nav, dismiss callbacks all live in one component. Removed ~120 lines of duplication between `app/index.tsx` and `app/library.tsx`. The bottom-inset bug fix lives here. ([components/DetailSheetHost.tsx](components/DetailSheetHost.tsx))
- **`<HomeRow>`** — replaces 6 inline FlatList blocks on home (urgent, what's-next, categories, pinned saved-filters, recently-added, untagged) with one parameterized component. Parent decides what to filter; the row renders. `app/index.tsx` 1224 → 939 lines. ([components/HomeRow.tsx](components/HomeRow.tsx))
- **`<TriageQueues>`** — extracts the queue-picker view from `app/triage.tsx`. Owns its own `incompleteExpanded` state. 820 → 673 lines. ([components/TriageQueues.tsx](components/TriageQueues.tsx))
- **ScreenshotDetail extractions** — three self-contained pieces pulled out of the 1987-line orchestrator into `components/detail/`: `LinksSection.tsx` (315 lines), `Lightbox.tsx` (52 lines), `SimilarRow.tsx` (62 lines). Now 1575 lines, down from 1987.
- **Sidebar wordmark** — dropped from sidebar; only the iris remains. Wordmark stays on home page header per Maggie's call. ([components/Sidebar.tsx](components/Sidebar.tsx))

### Cleanup commits (uncommitted backlog from prior sessions)

Long-pending changes that were sitting in the working tree at session start, finally split into focused commits:

- Haptics flag now cached in memory (taps don't pay AsyncStorage on every press)
- `tagQueries` filter chips (search bar's "+ add filter" promotes to a removable chip)
- `usePinOrder()` + `useHiddenRows()` for home pinned/hidden row state
- MediaLibrary hardening: `getAlbumAsync` / `requestPermissionsAsync` wrapped in try/catch (Expo Go's MEDIA_LIBRARY rejection no longer crashes the watcher); `granularPermissions=['photo']` to avoid AUDIO crash; `content://` fallback in `resolveDeviceAsset` for Samsung scoped-storage assets
- `analyze.ts` now copies `content://` URIs to cache before reading base64 instead of throwing
- `useBatchState` polls every 2s while a batch is active so the home banner shows live progress
- Hints respect the "Show tips" preference

### Flagged for review (not done; capture in case I'm not in the next session)

- **`app/upload.tsx`** is still 1003 lines. The five-phase state machine (idle / scanning / pick-batch / review / processing / done) has too much shared async state to split without rewriting `runScan` / `runProcessing` to accept callbacks. Intentionally left as-is; the entry point for a future split would be to extract the JSX of each phase as a presentational component routed by `phase`, with state lifted into a `useUploadFlow()` hook.
- **`ScreenshotDetail.tsx` metadata sections** — resonance / urgency / status / difficulty / time / category / subject / tags / notes all share the same `pending` patch + `editingSections` set + `Section` long-press wrapper + chip-row render pattern. Extracting them into per-field subcomponents would mean either deep prop drilling or a context provider. Best entry point for a future session: introduce a generic `<EditableMetaSection>` helper that owns the long-press → edit-mode toggle + shake animation + exit affordance, then thread chip rendering via children.
- **`lib/tagDictionary.ts`** is 588 lines but it's mostly the built-in dictionary data populated via `add(type, [...])` calls. Already organized; splitting wouldn't remove duplication.
- **`components/Sidebar.tsx`** is 608 lines. The 4 filter sections share a `<Text label>` + `<View chipWrap>` shell but each has different chip rendering (icon chips with CategoryIcon, plain Chip with urgencyColors, Iris icons, Chip with statusColors). A single `<FilterSection>` would need either a render prop or polymorphism — moderate cost for limited benefit.
- **Bottom card inset fix** is in place but I haven't verified on-device. When you reload the app, chips/footer should stay above the gesture nav and parchment should paint under it (no grid bleeding through translucent system bar).

## Open TODOs (post-sprint decisions)

- **Email/password auth.** Added 2026-05-07 as a dev fallback while magic-link email delivery was rate-limited. Magic link is primary per spec. **Decide post-sprint:** keep password as a permanent fallback option (good UX for users who lose access to email or can't get the link to bounce back), or remove it (simpler, fewer auth paths to secure). If keeping, gate the "use password" link behind a settings flag so it's not on the main sign-in screen.

## Auth email rate-limit reality (2026-05-07)

Supabase free-tier auth email rate limit is **project-wide ~3-4/hour**, NOT per recipient. The `+alias` trick (`maggie+test@miplata.com`) does NOT bypass it because the limit applies to the project, not the recipient address. Hit during initial phone testing.

**Implications:**
- Cannot rely on email-only auth (magic link, email confirm) for development testing or for any production flow with non-trivial user load.
- For dev: use email/password auth with "Confirm email" toggled OFF in Supabase project settings (Auth → Providers → Email).
- For production: configure custom SMTP. Options: Resend ($0/month for 3k emails, recommended), SendGrid (free tier 100/day), AWS SES, Postmark. Set up via Supabase → Auth → Email → SMTP settings.
- Long-term auth flow design needs to assume low email throughput on free tier — a 100-user product hitting the rate limit during a launch spike is a real failure mode.

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

## Pinch-zoom + intent mode — partial spec (2026-05-07)

**Pinch-to-zoom 4/3/2/1 columns** — implemented per spec. Pinch out (zoom in) reduces column count, pinch in (zoom out) increases it. Stepped, not fluid. Persisted to AsyncStorage as `overlook.grid_cols`. FlatList re-mounts on column change via `key={cols}`.

**Single-column intent mode** — partial v1: when columns = 1, cards render in a vertical scroll feed at portrait 9:16 aspect (matches typical phone screenshots). Tap → existing detail bottom sheet (same as grid). Cells use `width: 100%, aspectRatio: 9/16`.

**Spec evolution (2026-05-07):** the swipe-from-right edit sidebar was REMOVED from the spec. Tap → existing card-detail bottom sheet is now the canonical detail UX across grid + intent. One way to view detail across all modes. CLAUDE.md updated.

**Remaining intent-mode polish (deferred to post-sprint):**
- Tag pills overlaid at bottom of intent-mode image (currently no tags visible until tap → bottom sheet)

## Vercel function mounting (2026-05-07)

Originally placed the function in `server/api/analyze.ts` with the intent that Maggie would set Root Directory = `server` in Vercel. She couldn't find that setting in the UI, so I restructured: function is now at `api/analyze.ts` at the repo root, with deps (`@anthropic-ai/sdk`, `@vercel/node`) added to the root `package.json`. Vercel auto-detects `api/*` files at root with zero config. `vercel.json` at root sets `maxDuration: 60`. `tsconfig.json` excludes `api/` from app's tsc since the function uses `@vercel/node` types not present at runtime in the RN bundle.

If you ever want the function and app split into separate projects, move it back to `server/` and configure root dir on Vercel — it's the cleaner long-term setup. For sprint, single repo + auto-detection is simpler.

## EAS APK build — pre-flight checklist (when ready)

Before running `npx eas-cli@latest build -p android --profile production`:

- [ ] Make sure you've run `npx eas-cli@latest login` with an Expo account (free)
- [ ] Make sure you've run `npx eas-cli@latest init` once for this project (creates an Expo project ID, links repo)
- [ ] `eas.json` exists with `production.android.buildType: "apk"` ✓ (already in repo)
- [ ] `app.json` has `android.package: "com.overlook.app"` ✓ (already in repo)
- [ ] `app.json` has `name: "Overlook"` and `slug: "overlook"` ✓
- [ ] Latest commit pushed to GitHub (`git status` shows nothing pending)
- [ ] Local `.env` is filled in (it's not bundled — environment values for the production app come from `app.json` extras OR are baked in via `EXPO_PUBLIC_*` env vars at bundle time)

What to expect:
- Build queue + build itself: ~10-20 min total
- First build of the project asks if you want EAS to generate a keystore — say **yes** (free, managed by Expo)
- Email when done with download URL
- On phone: tap link → tap to install (allow "Install unknown apps" for your browser once)
- After install: launch from home screen — app icon will be the default Expo splash-style placeholder until we replace it

Known remaining work for production polish (not blocking APK):
- App icon (currently Expo default)
- Splash screen (currently parchment + Expo default image)
- Site URL on Supabase still set to `localhost:3000` (doesn't break magic link, but should be `overlook://` for prod)

## Phone-test debugging tips

- **Magic link "dimmed screen" / "site can't be reached":** the link redirected to `localhost:3000` because Supabase's default Site URL is set there AND our `exp://*` allowlist wildcard didn't actually match. Per Supabase wildcard rules, `*` matches one segment only (no `/`), so `exp://*` doesn't match `exp://192.168.1.5:8081/--/...`. Use `exp://**` (double asterisk) to match across slashes. Or — preferred — use the 6-digit OTP code path so deep linking is irrelevant.
- **OTP code path requires `{{ .Token }}` in Supabase email template:** Auth → Email Templates → Magic Link. Default template only has the link, not the code.
- **Reload app code on phone:** Shake the phone (literally — accelerometer trigger) → tap **Reload**, OR press `r` in the `npx expo start` terminal.
- **First bundling takes ~1-2 min in Expo Go.** Subsequent reloads are faster (Metro caches).
- **Phone needs same WiFi as Mac** running `npx expo start`. If on different networks, use `npx expo start --tunnel` (slower, more reliable).
- **No background work between Claude turns:** Claude only runs during a message-response cycle. When the user is offline (sleep, commute), no code is being written. Plan sprint time accordingly.

## Phone-test troubleshooting (decision tree)

**Symptom: QR scan doesn't load app, or shows "couldn't connect"**
- Both phone and Mac on the same WiFi? (most common cause)
- If on different networks: kill expo, run `npx expo start --tunnel` instead — Expo provides a tunnel URL that works across networks (slower, more reliable)
- If WiFi has client isolation enabled (some hotel/coffee-shop WiFi): tunnel mode is needed

**Symptom: bundling stuck or never finishes**
- First bundle of a fresh project: 1-3 min is normal
- If stuck >5 min: kill expo (Ctrl+C in terminal), run `npx expo start --clear` (blows out Metro cache)
- On phone: force-close Expo Go, reopen, scan QR fresh

**Symptom: code changes not appearing on phone**
- Press `r` in expo terminal (sends reload signal)
- Or shake phone → "Reload" in dev menu
- If still no change: restart with `npx expo start --clear`

**Symptom: magic link "this site can't be reached" / dimmed screen**
- See "Magic link" entries above. Use OTP code path instead (more reliable across Expo Go / dev / prod environments)

**Symptom: "Email rate limit reached"**
- Supabase default: ~4 emails/hour per address. Options:
  - Wait 30-60 min
  - Use a `+alias` (e.g. `maggie+test@miplata.com`) — same inbox, counts as different address for rate limiting
  - Bump rate limit in Supabase: Authentication → Rate Limits

**Symptom: AI tagging fails (toast error after upload)**
- Check `https://overlook-delta.vercel.app/api/analyze` returns `{"error":"method not allowed"}` on GET — that means the function is mounted
- Check Vercel deployments tab — latest should be Production + Ready
- Check env vars: `ANTHROPIC_API_KEY` (all caps) + `OVERLOOK_SHARED_SECRET` (all caps), both scoped to Production
- Check `.env` locally has `EXPO_PUBLIC_VERCEL_URL` and `EXPO_PUBLIC_OVERLOOK_SECRET`
- If still failing: in Vercel → Logs tab on the latest deployment → look for the actual runtime error

**Symptom: "Photo permission needed" alert won't dismiss**
- Tap the home button, go to Settings → Apps → Expo Go → Permissions → Photos → allow. Reopen.

**Symptom: cards appear but no AI tags after a long wait**
- Vercel function might be cold-starting (5-10s) on first call
- Or Anthropic rate-limited (unlikely at v1 scale)
- Tap a card → in detail sheet, tap "AI tag" button to retry manually
- Look at the expo terminal output for `[analyze] non-OK response` warnings

## Shallow-implementation watchlist (deepen iteratively)

- **AI vision prompt** in `server/api/analyze.ts` is a baseline I wrote, NOT Maggie's tested prompt. Swap when she pastes it.
- **Built-in tag dictionary** in `lib/tagDictionary.ts` is at ~450 entries; could grow to 1000+ for more coverage. Common gaps: brand names (source type), more food items, more home decor items.
- **Empty states / error messages** are minimal. Could be warmer, more specific.
- **Onboarding hints** (per CLAUDE.md gesture-discoverability section) entirely deferred.

## Things to remember before the account switch

- Move both `~/.claude/projects/.../memory/project_overlook*.md` files into project repo (paste relevant contents into CLAUDE.md or NOTES.md). Claude memory does not survive the account switch.
- Make sure Anthropic API key for Vercel is from a billing account that survives the switch (not tied to the Max plan).
- Capture working magic-link redirect config in NOTES.md once it works — undocumented combinations of `app.json` scheme + Supabase redirect allowlist are easy to lose.
