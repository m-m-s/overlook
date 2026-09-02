# Handoff brief — Overlook

**Read this first** if you're a fresh Claude session (account switch from Max → Pro). This file consolidates everything that lived in claude-memory but wouldn't survive the switch, plus a pointer to where the rest of the context lives.

---

## What is Overlook

Personal Android screenshot organization app — ingests phone screenshots, AI-tags them via the Claude API, lets the user filter / retrieve. Private second-brain tool, not social. Built by Maggie (maggie@miplata.com) — first mobile app, mid-level CLI skill, deep web background.

**Stack**
- Expo SDK 54 / React Native 0.81 / React 19, expo-router 6, Android-first
- Supabase (Postgres + auth) for metadata
- Vercel serverless function (`api/analyze.ts`) wraps the Claude vision API; ANTHROPIC_API_KEY lives only there
- @gorhom/bottom-sheet, expo-image, expo-media-library, expo-image-picker, expo-sharing, expo-calendar, expo-linear-gradient, react-native-gesture-handler, react-native-reanimated, react-native-svg, react-native-safe-area-context, react-native-draggable-flatlist
- Fuse.js for client-side fuzzy search (filters narrow first; search runs within filtered results)
- AsyncStorage for ephemeral local prefs (theme, hint state, learned tag dictionary, batch state, etc.)

**Where things live**
- [CLAUDE.md](CLAUDE.md) — canonical spec. Visual language, tagging system, gesture map, screen-by-screen UX, data model, build phases, design decision log. **Read this whenever implementing a new feature** — it has cross-cutting principles (privacy invariant, "nothing auto-sends", "drag up for full detail") that are easy to miss.
- [SPRINT.md](SPRINT.md) — active sprint scope. Overrides CLAUDE.md where they conflict. What's deferred / cut.
- [NOTES.md](NOTES.md) — running scratchpad. Decisions, gotchas, prompt versions, session arcs. Methodology section at the top frames this as a **spec-driven** project for the portfolio case study.
- `app/` — expo-router routes (index = home, library, triage, upload, saved-filters, settings, _layout)
- `components/` — UI. `components/detail/` is the bottom-card subcomponents (LinksSection, Lightbox, SimilarRow, EditableField).
- `lib/` — data + business logic. `screenshots.ts`, `uploads.ts`, `analyze.ts`, `analysisQueue.ts`, `tagDictionary.ts`, `filters.ts`, `themeContext.tsx`, `screenshotWatcher.tsx`, etc.
- `supabase/migrations/` — schema migrations.

---

## How Maggie wants to collaborate

(Also in NOTES.md but pulled here for the handoff.)

- **First mobile app**, first time with most of this stack. Knows basic git + can run commands, may not understand them.
- **Explain plain English BEFORE running things.** Narrate intent + the *why* of structural choices, 2-4 sentences max — like a junior pairing with a senior.
- **Run git commands for her**, don't hand them off.
- **For anything outside code** (Supabase dashboard, Vercel UI, env vars, phone taps): step-by-step numbered instructions.
- **If she signals confusion** ("wait", "what does X mean", silence after a complex tool call) — stop and explain, don't steamroll.
- **Teach as you go.** After non-trivial code/config changes, briefly explain what the new code does and why this approach over alternatives.
- **Follow the spec.** Default to spec compliance (CLAUDE.md, SPRINT.md, mockups). Deviations need a real reason — technical constraint or sprint cut. "Faster to type" or "polish later" are NOT sufficient. When deviating, document in NOTES.md.
- **Re-read the spec when implementing each feature**, not just at sprint planning. CLAUDE.md has cross-cutting principles that are easy to miss.
- **Keep building.** Bias toward action. Only stop to ask when the action is harder to undo than to build. Add things, run type-check, commit, push, move on.
- **Keep deepening.** When something has ranged data (dictionary, prompt content, options list), don't ship the minimum-viable and call it done. Expand iteratively as time allows.
- **Don't ask, just go.** Make reasonable choices and document them in NOTES.md. Only pause for genuine blockers. When work is complete, run a final check (type-check, lint, `expo-doctor`) and report a status summary.
- **Narrate as you go in chat** — not just in NOTES.md. 1-2 sentences in chat describing what you just did and why. Maggie wants to follow along even in autonomous mode.

### Feedback rules earned the hard way

These have been corrected multiple times — internalize them:

1. **Strict sentence-case for all copy.** Sentence-style strings get a capital first letter and a period. Example: "Tap save, skip, or delete to act." NOT "tap save, skip, or delete to act". After punctuation in a string ("Overlook · …", "Loading… "), the next word starts capitalized: "Overlook · A home for…", NOT "… · a home for…". Only single-word labels / chips / buttons / imperative microcopy ("save", "dismiss", "all", "see all ›") may stay lowercase. Section headings rendered with `textTransform:'uppercase'` (e.g. "URGENCY") are fine as lowercase source strings because CSS uppercases them. **Before writing ANY user-facing string, ask: is this a sentence (verb + object, multi-clause) or a label (single phrase)?**
2. **No visible edge-swipe hint bar.** `EdgeSwipe.tsx` is an invisible 24px-wide gesture strip — NO accent line, dot, or visible element. CLAUDE.md mentions a 4px hint bar but Maggie's preference overrides; she rejected it ("no edge swipe hint bar bad bad ugly please remove"). When polishing, follow user's taste over the doc.
3. **Spec compliance over sprint speed.** When you catch yourself doing something different from CLAUDE.md, ask: is this a real constraint, or am I taking a shortcut? Sprint shortcuts that aren't justified accumulate and dilute the design.
4. **Specific over abstract when teaching.** Concrete examples beat generalities.

---

## Current state of the build

**Working / shipped**
- Auth via Supabase magic link + email/password fallback
- Bulk upload pipeline (lib/uploads.ts, app/upload.tsx) with batch slider, batch review grid, processing screen, resume-on-reload
- Device-only image storage per privacy spec (only metadata in Supabase; bytes leave only during AI analysis and are discarded)
- Privacy invariant enforced at every send-bytes-off-device point (lib/analyze.ts, lib/analysisQueue.ts) — `local_only` is queried at latest possible moment
- AI vision proxy on Vercel (`api/analyze.ts`); offline analysis queue with retry
- Home page with category rows, urgent row, pinned saved-filters, recently-added, untagged-with-triage shortcut, reorder mode
- Library grid (4/3/2/1 column pinch-zoom; 1-col is intent mode)
- Card detail bottom sheet (image header with parallax + lightbox, metadata sections with long-press → edit → done editing, Apply/Cancel pending bar, similar row, share/delete footer)
- Triage flow (queue picker, swipe gestures save/skip/delete, auto-advance after AI analyze)
- Filter sidebar (categories, urgencies, statuses, resonances, tag-query chips from search-bar "+ add filter")
- Saved filters: create from filtered grid, pin to home, rename, delete, icon picker (category silhouette OR emoji)
- Post-screenshot popup (watcher detects new screenshots; gallery-picked images route through the same UX)
- Calendar pill on urgency row when AI extracts a date
- Notification deep-link (tap push → that asset surfaces in the popup)
- Demo mode (toggle in settings → in-memory sample data)
- Themes (editorial light + dark; colorblind-friendly variant)

**Flagged for next session**
- **Bottom card prev/next horizontal swipe** is image-only right now (regression from when it worked card-wide; we sacrificed it to fix scroll). Restoring it requires an outer Pan with strict `failOffsetY` / `activeOffsetX` to coexist with the inner BottomSheetScrollView.
- **Saved filters page** lets the user rename but not edit the icon. Mirror the create-flow icon picker.
- **`app/upload.tsx`** still 1003 lines (5-phase state machine: idle / scanning / pick-batch / review / processing / done). Splitting needs to extract `runScan` / `runProcessing` business logic into a hook before the JSX can be pulled apart safely.
- **`components/ScreenshotDetail.tsx`** still ~1600 lines. Resonance / urgency / notes use `<EditableField>` now, but status/difficulty/time and category/subject/tags stay inline because they have multi-field combined toggle logic.
- **`components/Sidebar.tsx`** is 608 lines with 4 filter sections sharing a `<Text label>` + `<View chipWrap>` shell. Single `<FilterSection>` would need a render prop or polymorphism — moderate cost, limited benefit.

**Known design decisions captured at the bottom of CLAUDE.md** — read the "Design decision log" section before re-litigating any visual / interaction call. Notable ones: square (now 4:5 portrait) cards, no-rounded thumbnail corners, iris for resonance, top-edge gradient for status+urgency, no nav bar / full bleed grid, intent field DELETED as redundant, parchment over eggshell, dashed-underline stat layout, typed tags over flat tags.

---

## Architecture decisions you'll re-encounter

### Spec-driven development methodology
This is the centerpiece of the portfolio case study. Every visual + interaction call (dashed underlines, parchment palette, 4:5 grid card ratio, sharp corners, typed tags) is in CLAUDE.md *with the alternatives considered and the reason for each pick*. The spec is the contract; the code adapts to it. Don't quietly drift from it.

### Bottom card sheet (was the hardest part of this sprint)
After many iterations, settled on:
- `bottomInset={0}` (sheet's parchment paints under the gesture nav — industry standard)
- `snapPoints=['60%', '85%', '100%']` (progressive peek-then-expand)
- `enableContentPanningGesture` left at default (drag-up-on-content auto-expands sheet)
- `imageGesture` (Pan + Pinch) wraps ONLY the absolute-positioned image header — wrapping the whole sheet caused recurring scroll caps because RNGH gestures nesting interfered with `BottomSheetScrollView`'s internal pan handler
- Inner Pressable wrapping all scroll content was ALSO eating gestures — replaced with plain `<View>`
- Inline footer at end of scroll content with `<View height={300+insets.bottom}>` spacer (BottomSheetScrollView's `contentContainerStyle.paddingBottom` is unreliable on Android — a real layout child enforces clearance)
- Lightbox `Modal` cannot host RNGH gestures cleanly without a nested `GestureHandlerRootView`, which crashes on Android. Tap and X button cover dismissal.

### Privacy invariant
Read CLAUDE.md "Privacy invariant" section. **Every code path that sends image bytes off-device MUST check `local_only` first.** Bytes only leave when the row's `local_only === false`. This is a hard architectural rule, not a soft preference. Already enforced in `analyzeAndPersist`, `drainAnalysisQueue`, the post-screenshot popup; new code that talks to the AI proxy must add the same gate.

### Demo mode
`lib/demoMode.ts` + `lib/demoData.ts`. When the flag is on (settings toggle), `fetchScreenshots()` short-circuits to in-memory sample data. Useful for screenshots / video walkthroughs / portfolio shots without uploading real data.

### Categories: text → text[]
The `categories` text[] column was added to support multi-category screenshots. The legacy `category` text column is still maintained as the "primary" (corner icon on cards uses categories[0] === category). Filtering matches if ANY category matches.

### Action URLs
The vision prompt returns up to 3 typed action URLs per screenshot (profile / pattern / stream / video / maps / listing / tickets / directions / buy / recipe / watch / read / search). User can long-press to remove manual ones, tap to open. Stored as a jsonb array on the screenshots row.

### Tag dictionary
`lib/tagDictionary.ts` (~588 lines). Built-in dictionary (~400+ entries) + AsyncStorage-backed learned dictionary. Auto-types tags when the value matches one type; prompts the user when ambiguous; leaves untyped when unknown. User type assignments save to learned dictionary for future auto-typing.

---

## Environment / infra

- `.env` (NOT committed) holds:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_VERCEL_URL` (your Vercel function root, e.g. `https://overlook-delta.vercel.app`)
  - `EXPO_PUBLIC_OVERLOOK_SECRET` (shared secret for the Vercel function — set the same value in Vercel as `OVERLOOK_SHARED_SECRET`)
- Vercel env (production scope): `ANTHROPIC_API_KEY`, `OVERLOOK_SHARED_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` if any function path needs server-side writes
- Anthropic API key for the *app* is separate from the Claude Code subscription. Make sure it's on a billing account that survives the Max → Pro switch.

### Phone test workflow
- `npx expo start --dev-client` (or `--tunnel` if wifi has client isolation)
- Phone needs same wifi as Mac for LAN; otherwise tunnel
- Reload: shake phone → Reload, OR press `r` in expo terminal
- First bundle 1-2 min; reloads faster
- Check `expo-doctor` if anything looks weird
- Magic-link auth troubleshooting: see NOTES.md "Phone-test debugging tips" section

### Distribution
Local APK via EAS for now (`npx eas-cli@latest build -p android --profile production`). See NOTES.md "EAS APK build — pre-flight checklist" for what to check before running.

---

## Learnings (technical gotchas worth carrying forward)

### React Native + gorhom/bottom-sheet
- **An RNGH `<GestureDetector>` wrapping a `BottomSheetScrollView` (or any of its children) caps the inner scroll travel.** RNGH gestures nest in non-obvious ways — even with `failOffsetY([-40, 40])` on the outer Pan, the scroll's internal pan handler doesn't get full range. Fix: scope the outer GestureDetector to a sibling (e.g. only the image header), not a parent of the scroll.
- **Wrapping all scroll content in a single `<Pressable onPress>` claims gestures and caps scroll the same way.** The inner Pressable was an "tap-outside-to-close-edit-mode" affordance. Replaced with a plain `<View>`; the affordance moved to a "done editing" link inside each editable section header.
- **`BottomSheetScrollView`'s `contentContainerStyle.paddingBottom` is unreliable on Android.** Sometimes honored, sometimes not. Use an explicit `<View height={n}>` as the last child of the scroll for guaranteed clearance.
- **Gestures don't propagate into RN `Modal` children without a nested `GestureHandlerRootView`** — but nesting GestureHandlerRootView inside Modal crashes on Android. Workaround: drop gesture-driven UX inside Modals (lightbox lost swipe-to-close; tap + X button replaced it).
- **A lightbox / "modal over a sheet" needs RN's built-in `<Modal>`, not gorhom's BottomSheetModal**, because the sheet is itself a modal — nesting gorhom modals doesn't render reliably.
- **`enableContentPanningGesture={false}` on `BottomSheetModal`** disables the sheet's claim on content drag — useful when scroll caps are happening, but breaks "drag down at content top to dismiss / drag up at content top to expand snap." Tradeoff.
- **Single snap point sidesteps gorhom's snap-coordination logic entirely** — useful as a debugging step but breaks the peek-then-expand UX.

### Android edge-to-edge mode
- `app.json` has `"edgeToEdgeEnabled": true` for Android. The app paints under the system nav bar (gesture-nav indicator is a translucent overlay).
- **`useSafeAreaInsets().bottom` may report 0** on some Android edge-to-edge configurations even when there IS a gesture nav indicator. Don't rely on it alone for clearance — pad with a hardcoded buffer (~50px) plus the inset.
- A "sheet under the nav" (bottomInset=0) is the correct default — the sheet's content shows through the translucent bar (industry standard, like Apple Music / Maps). NOT to be confused with "the page underneath the sheet shows through" (which IS wrong and was a real bug).

### Expo Go quirks
- **`expo-calendar`, `expo-secure-store`, and other native modules NOT bundled in Expo Go** crash the bundle when imported at module top. Lazy-require them inside platform branches (`if (Platform.OS === 'ios') { const Calendar = require('expo-calendar'); ... }`).
- **`MediaLibrary.getAlbumAsync()` and `requestPermissionsAsync()` can reject in Expo Go** with "Missing MEDIA_LIBRARY permissions" on Android. Wrap in try/catch so the watcher doesn't crash; fall back to a degraded path.
- **`MediaLibrary.requestPermissionsAsync(false)` auto-requests AUDIO permission** which crashes if AUDIO isn't declared in AndroidManifest. Pass `granularPermissions=['photo']` to scope the request.
- **`getAssetInfoAsync(assetId)` rejects on Samsung scoped-storage** for assets the app didn't create. Fall back to constructing the standard MediaStore URI directly: `content://media/external/images/media/${assetId}`.
- **`FileSystem.readAsStringAsync` doesn't accept `content://` URIs**, but `copyAsync` DOES, and the destination `file://` is readable. Copy → cache → read base64 → delete the temp file.
- **HMR on Expo Go gets stuck after a bundle error** — the JS keeps the old broken state. After fixing a runtime crash, fully kill Expo Go (swipe out of recents) and reopen, don't just reload.
- **First-launch black screen on Expo Go** is usually a stale cached bundle from a previous crashed state. `npx expo start --clear` + full Expo Go kill clears it.

### React Native styling
- **CSS `borderStyle: 'dashed'` renders as evenly-spaced dots**, not dashes. Looks dotted, not dashed. For real control, use `react-native-svg`'s `<Line strokeDasharray="3, 3">`.
- **`StyleSheet.hairlineWidth`** is the thinnest visible line the device can render (typically 0.5-0.66 logical pixels on retina). Use for delicate dividers / underlines instead of `borderWidth: 1`.
- **`textTransform: 'uppercase'` lets you write source strings in lowercase** ("urgency") while rendering as "URGENCY" — keep this in mind when writing test assertions or copy edits.
- **Pressable's `hitSlop` overlaps with sibling Pressables' tap zones** when both have generous hitSlop AND tight margin between them. Reduce hitSlop on the inner Pressable when sibling tap targets are close.
- **`react-native-reanimated` worklets conflict with @gorhom/bottom-sheet's gesture context** in some setups. Avoid worklets inside the sheet — use plain Animated.Value for animations there.

### Data layer / Supabase
- **Storing optional fields in an existing `jsonb` column avoids migrations** for prototype-stage schema changes. We added `searchQuery`, `tagQueries`, `icon` to the `saved_filters.filters` jsonb without DDL.
- **uuid columns in Postgres reject the `timestamp-random` string format** (code 22P02). Use `Crypto.randomUUID()` for new IDs.
- **`Supabase Storage` was abandoned in favor of device-only image storage** mid-build per CLAUDE.md privacy spec ("Images: On device only. Never stored on server"). Migration kept the legacy `storage_path` column for old rows; new rows use `device_asset_id`.
- **Auth email rate limit on Supabase free tier is project-wide ~3-4/hour, NOT per recipient**. The `+alias` trick doesn't bypass it. Configure SMTP (Resend / SendGrid) for any production load.

### Performance
- **`AsyncStorage` reads on every render / tap lag the UI noticeably** (~100ms hit). Cache hot flags in module scope; refresh from the consumer when it changes (e.g. `lib/haptics.ts`).
- **`expo-media-library`'s `getAssetsAsync` is paginated** — don't try to fetch thousands at once. Use `after: cursor` and limit to ~200 per page.

### Refactor patterns that worked here
- **Extract a "host" component for repeated framework-config blocks.** `<DetailSheetHost>` consolidated the BottomSheetModal config that was duplicated in `app/index.tsx` and `app/library.tsx` — single source for snap points, backdrop, prev/next nav, etc.
- **Parameterize a row component to replace inline FlatList variants.** `<HomeRow>` replaces 6 inline blocks (urgent, what's-next, categories, pinned filters, recently-added, untagged) with one component. Parent decides what to filter; the row renders.
- **Per-section helper for repeating-pattern UIs.** `<EditableField>` wraps the Section + SectionHeader + isEditing-conditional + Shake boilerplate that was duplicated 8+ times in the card detail. Read/edit slots take JSX so each section keeps its specific shape.
- **Don't force-fit when shapes don't match.** Status/difficulty/time has a multi-field combined toggle; it doesn't fit `<EditableField>`'s single-field shape. Forcing it in would have added complexity for the sake of "consistency" without a real win. Left inline.

### Process learnings (for the next session)
- **When you find yourself patching the same dial more than twice (e.g. spacer 140 → 320 → 480 → 200), STOP and re-examine the architecture.** That signals the model isn't right, not that the value is wrong. The bottom-card scroll saga went through ~10 iterations on padding/snap before the actual root cause (Pressable wrap + outer GestureDetector) surfaced.
- **Identify ONE variable per change when debugging.** I made multiple changes per commit during the bottom-card debug; that made it hard to know which fix mattered. Single-variable changes + clear "did this help?" feedback loop is faster overall.
- **The user explicitly says "rebuild from scratch if needed" when they're frustrated.** Take that seriously — sometimes the fix isn't another patch, it's a clean re-architecture.

---

## Sprint clock

Per project memory: ~36h grind time before account switch. After Max → Pro, NO session memory survives. Anything important must land in CLAUDE.md / SPRINT.md / NOTES.md / this file — not in claude memory.

When in doubt, write to a project file rather than relying on memory. The new account starts with NOTHING beyond this repo.
