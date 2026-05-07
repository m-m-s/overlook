# Overlook — Project Spec & Claude Code Brief

## What this is
A personal screenshot organization app for Android. The core problem: thousands of stale screenshots on a phone that are impossible to find or reference later. Overlook ingests, AI-analyzes, and richly tags screenshots so they can be filtered and retrieved instantly.

This is a private personal reference tool — not social, not discovery. Think second brain, not Pinterest. The key distinction is the depth of the tagging system and the screenshot-on-capture trigger.

---

## Current status
- Brainstorming and spec complete
- UI/UX design phase complete (mockups exist as HTML files)
- Ready for code

---

## Development environment

### Setup (both Mac and PC)
- Node.js
- Expo CLI
- Claude Code

### On your Android phone
- Expo Go app from Play Store — scan QR code from terminal to live-preview as you code, no build step needed during development

### No emulator needed
Real device via Expo Go is the primary dev loop. Build APK only when ready to test the full native experience (background FileObserver, etc).

### Multi-machine workflow
Same GitHub repo (private), cloned on both machines. Always `git pull` before starting, `git push` when stopping. Both machines have full spec and context via CLAUDE.md.

### Distribution
Build APK via Expo for sideloading. No app store needed for v1.

---

## Stack
- **Frontend:** React Native via Expo, Android first
- **Backend:** Supabase (database + auth) + Vercel (serverless functions for API calls)
- **AI:** Claude API (vision) for image analysis via Vercel — API key never on device
- **Search:** Fuse.js for fuzzy client-side search across all metadata
- **Cost target:** Free tier infrastructure until meaningful user growth

---

## Core principles
1. Privacy first — nothing leaves the device without explicit user action
2. Fast tagging — 5 seconds or less for manual tagging
3. Bulk capable — must handle thousands of existing screenshots
4. Cost controlled — API use is intentional, never automatic
5. Content-first UI — warm, editorial, the screenshots are the art, UI is the frame
6. No unnecessary chrome — no nav bar, no persistent top bar, full bleed grid

---

## Architecture

### What lives where
- **Images:** On device only. Never stored on server. The only moment an image leaves the phone is during Claude API analysis, then discarded.
- **Metadata:** Supabase — tags, categories, descriptions, all text fields
- **API key:** Server-side only on Vercel functions
- **Search index:** Client-side via Fuse.js

### Privacy model
- Nothing auto-sends ever
- Post-screenshot popup requires explicit tap to analyze
- Bulk upload has grid review step to deselect sensitive images
- Certain categories (Documents, Messages, Finance) default to local-only
- Redaction tool before API send (v2 feature)

---

## Visual design language

### Direction
Warm, cultural, editorial. Like a well-curated art magazine — i-D, Apartamento energy. Content is the hero, UI disappears. Not clinical, not trendy, timeless.

### Base color
Parchment: `#EFEEEA` — muted, editorial, like aged paper. Not too yellow, not too white.
Dark variant for dark theme: TBD (themes are v2)

### Typography
- Serif (Georgia or similar) for titles, big numbers, editorial moments
- System sans-serif for labels, tags, UI elements
- Small caps for section labels with letter-spacing

### Divider style
2px dashed lines used as underlines for stat rows. Lines sit close to the text they belong to.

### Stat display pattern
Small sans-serif label left-aligned, big serif number right-aligned, separated by dashed underline. Used across bulk upload, processing screens, triage.

### No rounded corners on thumbnails
Screenshots have sharp corners everywhere — grid, preview, feed.

### Rounded corners only on
- Bottom sheets (top corners only, 16px radius)
- Buttons (4px radius)
- Tag chips (3px radius)
- Slider box component (12px radius)
- Filter sidebar (none — full height flush)

---

## Card design (grid view)

### Anatomy
- Full bleed square thumbnail, center-cropped, slightly zoomed
- **Top edge:** connected gradient bleed — status color left fading into urgency color right. Single continuous gradient, no gap.
- **Bottom left:** category icon — silhouette style, 24x24 viewbox, drop shadow only, no pill/container
- **Bottom right:** resonance iris icon — same sizing and shadow treatment
- **Grid gaps:** 3px, parchment colored

### Grid zoom levels (stepped, not fluid)
- **4 columns** — bulk view, for multi-select and bulk tagging
- **3 columns** — default compact view
- **2 columns** — expanded browsing
- **1 column** — intent mode (separate UX, see below)

### Icons — all drawn in 24x24 viewbox, silhouette style, consistent stroke weights
Categories: craft (scissors), fashion (hanger), film (clapperboard), TV (monitor), food (cutlery), art (palette), music (notes), places (pin), meme (laugh face), messages (speech bubble), shopping (bag), reading (book), events (calendar), tech (code brackets), documents (page)

### Resonance — iris system (concentric circles, no lashes)
- Level 1: single horizontal line
- Level 2: outer circle + filled center dot
- Level 3: outer circle + middle circle + filled center dot

### Tag styling
- **Manual tags:** solid fill background, contrasting font
- **AI tags:** outlined border, no fill, same color font — lighter visual weight

---

## Top edge gradient system

### Status colors (left side) — earthy harmony palette
- Ready to do: `#7A8B5C` (olive)
- Need supplies: `#B5704A` (terracotta)
- In progress: `#9B7A8B` (dusty mauve)
- Need to research: `#6B7C85` (faded slate)
- Done: no color
- No status: transparent

### Urgency colors (right side) — warm temperature scale
- Today / Expires soon: `#C0392B` (warm red)
- This week: `#D87538` (warm orange)
- This month / This season: `#C9A14B` (warm gold)
- This year / Someday: `#B5A485` (faded warm)
- No urgency: transparent

### Gradient behavior
`linear-gradient(to right, [status], [status] 35%, [urgency] 65%, [urgency])`
When one is absent, that side is transparent. When both absent, no edge bleed.

---

## Tagging system

### Two-layer hierarchy
**Category** (what is it — AI can suggest, user confirms)
Seeded list: Craft, Fashion, Film, TV, Food, Art, Music, Places, Meme, Messages, Shopping, Reading, Events, Tech, Documents
Evolves with usage. New categories can be added by user.

**Subject** (specific thing — AI suggested, user confirmed)
Examples: Crochet, Hat, React hook, Italian restaurant
Not predefined. Grows organically through AI suggestions and manual entry.

### Quantitative fields

**Resonance** (always manual — 3 abstract levels via iris icon)
Order in all UIs: Resonance → Urgency (resonance is more personal and fundamental than urgency which can change)

**Urgency** (AI auto-sets when date detected, user can override — also serves as actionability indicator, replacing the need for a separate Intent field)
- Someday
- This year
- This Spring / This Summer / This Autumn / This Winter
- This month
- This week
- Today
- Expires soon (auto-set when AI detects deal/offer)
- Event on [date] (auto-set when AI detects specific date)

**Difficulty** (applies when intent is Do or Inspire)
- Beginner
- Intermediate
- Advanced

**Time to complete** (applies same as difficulty)
- Quick (under an hour)
- Afternoon
- Full day
- Multi-day
- Long-term

**Status** (always manual)
- Ready to do
- Need supplies
- Need to research
- In progress
- Done

### What AI fills vs what's always manual
- **AI fills:** Category, Subject, typed tags, Difficulty, Time to complete, event dates, urgency when date detected
- **Always manual:** Resonance, Status, Urgency (unless auto-detected)

### Typed tag system

Every tag has an optional type. Tags display left to right, general → specific. This creates a visual hierarchy without a rigid tier structure.

**Tag types (display order, general → specific):**
1. **category** — Craft, Fashion, Film, Food, etc. (top level, already exists as its own field)
2. **item** — what is it: dress, recipe, pattern, poster
3. **genre** — horror, comedy, sci-fi, lo-fi (film/tv/music/reading)
4. **cuisine** — Italian, Japanese, Mexican (food)
5. **technique** — cable stitch, watercolor, sourdough (craft/food)
6. **style** — minimalist, vintage, streetwear, rustic
7. **material** — wool, cotton, ceramic, leather
8. **color** — black, earth tones, pastel, monochrome
9. **season** — spring, summer, fall, winter
10. **occasion** — casual, formal, date night, birthday
11. **mood** — cozy, bold, moody, bright
12. **source** — brand/creator: Nike, Bon Appétit, artist name
13. **person** — who it's for/about: Anton, mom, self
14. **place** — location: Tokyo, Brooklyn

Not every screenshot uses every type. AI returns tags with types. UI displays them in order, each type with slightly different visual treatment for fast scanning.

**AI tags:** Always typed. Displayed in hierarchy order. Outlined style (lighter visual weight).

**Manual tags — three behaviors:**
1. **Auto-type confidently** — app checks two dictionaries in order:
   - **Learned dictionary** (personal) — key-value table built from user's own type assignments. "Anton" = person, saved when user first assigns it. Checked first, takes priority.
   - **Built-in dictionary** (ships with app) — static JSON of known words: colors, seasons, cuisines, common items. "Blue" → color, "summer" → season, "dress" → item.
2. **Ask if ambiguous** — word exists in multiple type lists in built-in dictionary (e.g. "Orange" = color or food). Quick inline prompt with two small chips under the input. One tap to resolve. Result saved to learned dictionary.
3. **Leave untyped if unknown** — not in either dictionary. Stays as general tag. If user later manually assigns a type, saved to learned dictionary for future auto-typing.

**Implementation is simple:**
1. Check learned dictionary → found? auto-type
2. Check built-in dictionary → found in one type? auto-type
3. Found in multiple types? show chips to pick
4. Not found? untyped
5. User manually assigns type → save to learned dictionary

**Manual tags visual:** Solid fill style (heavier weight than AI outlined tags).

### Tag display order on cards/detail views
Typed tags first (in type hierarchy order) → untyped tags after. Within the same type, alphabetical.

---

## Navigation & layout

### No nav bar
One primary destination (library). No persistent bottom or top navigation.

### Full bleed grid
Grid runs edge to edge. No side padding on the default 3-column view.

### Filter/search sidebar
- Swipe from left edge to open
- 80% width, full height, grid dimmed behind
- Subtle 4px swipe hint bar on left edge at 50% height

#### Sidebar contents (top to bottom):
1. Overlook logo — iris icon + wordmark
2. Search bar — Fuse.js fuzzy search
3. Placeholder text "select filters" when no filters active, active count + "Clear all" when filters are on
4. **Urgency** filter chips (higher than status)
5. **Status** filter chips with colored dots
6. **Category** icon chips
7. **Resonance** iris chips
8. Divider
10. **Triage** — entry point with queue counts preview
11. **Saved filters** — link to saved filters homescreen
12. Upload screenshots button (primary)
13. View full library button (secondary)

All filters are multi-select. Combine freely. Search runs within filtered results.

### Saved filters (smart albums)
- When filters are active, the **grid view gets a header bar** showing active filter chips with a "Save" button — not in the sidebar, on the grid itself
- User names the saved filter (e.g. "Gift ideas for Anton", "Fall craft inspo")
- After naming, prompt: **"Pin to home?"** toggle — pinned filters appear as rows on home page, unpinned ones only live in saved filters page
- Saved filters have a **dedicated page** accessible from sidebar — same visual language as home page: title, image count, "See all ›", horizontal scroll row for each saved filter
- They auto-update — new screenshots matching those filter combos appear automatically
- A screenshot can appear in multiple saved filters without duplication
- Can pin/unpin from saved filters page or from within the filtered grid header
- Manage/rename/delete saved filters from saved filters page (long press)

### Home page (top to bottom):
1. **Batch resume banner** (conditional) — appears when a bulk upload batch is in progress or next batch is ready. "Batch 2 ready for review" — taps straight into it.
2. Urgent section — horizontal scroll row, auto-hides when nothing urgent with "nothing urgent... see what's next" toggle showing This Month/Season items. Same card treatment as all other category rows.
3. **Auto-surfaced category rows** — horizontal scroll, most interacted categories surface first automatically. User reorderable. Each with category icon + name + count + "See all ›".
4. **Pinned saved filter rows** — only saved filters explicitly pinned by user. Same row treatment.
5. Recently added — full bleed 3-column grid, no side padding, extended (12+ items)
6. Untagged — horizontal scroll row at bottom, bare dimmed cards (no icons, no edge treatment, 0.65 opacity), count visible. "Triage" button to LEFT of "See all ›"
7. No floating add button — upload lives in sidebar

### Empty state (first launch, no screenshots)
Just a big "Upload screenshots" button, nothing else. Clean and clear.

### Filtered grid view
- Separate page from home (not a transform — back/home button navigates back)
- **Header is the active filters** displayed as live editable tag chips
- Layout: `[← Home] [chip] [chip] [chip] [× clear all] [Save]`
- Each filter chip has an X to remove that filter — grid refilters live below
- Tap a chip to modify it (opens relevant filter options)
- "Clear all" removes all filters, returns to full library
- "Save" button saves current filter combo as a smart album (prompts for name + pin to home toggle)
- Header stays sticky while scrolling
- Grid below uses same card design, same zoom levels (4/3/2), supports multi-select bulk tagging

### "See all" behavior
Navigates to filtered grid view page, pre-filtered to that category.

---

## Screens

### 1. Card detail bottom sheet
- Tap a card in grid → bottom sheet slides up
- Drag handle at top
- Image preview with edge bleed + category icon + resonance iris
- No title or description (tags serve that purpose)
- **Category depth:** Category → Subject as connected chips
- **Tags:** manual (filled) and AI (outlined) mixed together
- **Metadata:** urgency, resonance, status, difficulty, time — all as tag-style chips
- **Notes:** text area at bottom
- **Source URL:** tappable link row with external link icon — AI extracted or manually entered. Opens in browser. Not shown on grid card, only in detail views.
- **Delete** button at bottom (trash icon)
- **Share** button (Android native share sheet)
- Long press any section → edit mode (shake animation, X on tags)
- **Apply** to confirm edits, Cancel to revert — no auto-save
- Drag up for full detail view

### 2. Post-screenshot popup
Appears when Android FileObserver detects new screenshot.

**Default state shows all at once:**
- Image preview
- Resonance iris chips
- Urgency chips
- **Quick tag text input** — optional, for adding a custom tag before sending (e.g. type "Anton" to tag a gift idea)
- Three buttons (large, thumb-friendly, 16px padding, 15px font):
  - **Analyze & Add** — sends to API with selected resonance/urgency + any custom tags
  - **Add without AI** — expands full manual tagging below (category icon chips, custom tag text input with add button, status, difficulty, time)
  - **Dismiss**

### 3. Triage mode
**Entry screen — three clean queues:**
- Untagged (needs everything)
- Incomplete (tapping expands to sub-queues: no resonance, no status, no urgency)
- AI unreviewed (has AI tags, user hasn't confirmed)

**Swipe interface:**
- Progress bar + counter at top
- Screenshot card with existing tags shown
- Only missing fields appear below (contextual)
- Field order: Resonance → Urgency
- Three actions: Save (swipe right) / Skip (swipe left) / Delete (swipe up)
- Delete: undo toast 5 seconds, then optional "Also delete from device?"
- Cards animate between items

### 4. Bulk upload
**Screen 1 — Gallery scan:**
- Stats in dashed-underline format
- Batch size slider in rounded border box (centered title, big serif number, "screenshots per batch" subtitle, dot notches on track)
- Battery hint
- "Review first batch" / "Process all without review" / "Add all without AI" (imports into library with no analysis, ready for manual tagging/triage)

**Screen 2 — Batch review grid:**
- 4-column grid
- Three card states: default (analyze), tap once (add without AI — dimmed with tag icon), tap again (exclude — dimmed with X)
- Already uploaded greyed with checkmark
- Select all / deselect all, selected count
- Confirm button

**Screen 3 — Processing:**
- Spinning iris animation
- Dashed-underline stats
- Progress bar, can close app, pause button

### 5. Single column intent mode (scroll feed)
- Entered by pinching to 1-column from grid
- Vertical scroll feed of full-width images at portrait 9:16 aspect (matches phone screenshots)
- Edge bleed at top of each image
- Category icon + resonance iris on image (same as grid card)
- Minimal tag pills at bottom of image (optional polish — not blocking)
- **Tap an image** → existing card-detail bottom sheet (same UX as grid). No separate side panel.

(Earlier spec drafts had a swipe-from-right edit sidebar specifically for intent mode. Removed because the bottom sheet already provides a good detail UX in every mode — having two different ways to view detail adds complexity without value. One canonical detail view across grid, intent, and any future mode.)

### Delete access
- Delete action available in **all viewing modes**: bottom sheet (grid + intent), triage swipe
- Shown as trash icon or "Delete" button at bottom of detail view
- Always triggers undo toast (5 seconds) then optional "Also delete from device?"

### Edit mode behavior (all contexts)
- Long press a tag section → enters edit mode
- Visual: subtle shake animation on chips, delete X appears on each tag
- Changes are **pending until Apply is tapped** — no auto-save
- Cancel or closing without Apply reverts all changes
- Prevents accidental edits while browsing

### Local-only protection
- Once "Add without AI" is selected and saved, card is flagged `local_only: true`
- AI analyze button is disabled/hidden on that card everywhere
- User can manually unlock from detail view if they change their mind — requires intentional action

### API failure handling
- If analysis fails on a card, it stays in queue marked as "failed"
- Processing continues to next image — doesn't block the batch
- After batch finishes, summary shows: "187 analyzed, 13 failed"
- Failed cards can be retried individually or as a group
- Screenshot is already in library without AI tags — appears in untagged/triage queue

### 6. Bulk tagging
- Available in **all grid views** — 4-column, 3-column, and 2-column (not intent mode / 1-column since that's scroll-based)
- Long press a card → enters multi-select mode
- Tap additional cards to select
- Tagging panel slides up from bottom (same chip interface)
- Apply tags to all selected at once

### Edit mode visual
- When tags/sections enter edit mode (via long press), chips do a **subtle shake animation**
- Delete X appears on each tag
- Clear visual distinction between browse and edit states
- Warm and playful, matches editorial vibe

### Share
- Share button available in bottom sheet detail view and intent mode sidebar
- Uses Android native share sheet — send screenshot to any app
- Prevents user from having to find the original file in their gallery

### Multi-select behavior
- Long press a card → enters multi-select mode
- Tap additional cards to add to selection
- **Tap a selected card again to deselect** — individual deselect supported
- Counter shows "4 selected"
- Tap outside all cards or back gesture exits multi-select entirely

### Home page row reordering
- Long press a category row header → enters reorder mode
- Drag rows up/down to rearrange
- Applies to both auto-surfaced categories and pinned saved filters

### Notes field
- Scrollable, not expanding — keeps card detail view height predictable

### Category icons in grid
- Purely visual — no tap action on the icon itself
- Too complex for a small touch target, not worth the confusion

---

## Gesture map

### Principles
- Gestures are **contextual per screen**, not global
- Each screen has maximum 3-4 gestures — never overloaded
- **Horizontal swipe = panels/navigation**
- **Vertical swipe = actions/reveal/dismiss**
- **Pinch = zoom**
- **Long press = mode change (edit/select)**
- **Tap = primary action**
- No fallback buttons — gestures ARE the interface
- Subtle persistent affordances (edge hint bars) instead of buttons

### Grid / Home screen
| Gesture | Action |
|---------|--------|
| Swipe from left edge | Open filter sidebar |
| Pinch in/out | Zoom grid (4↔3↔2↔1 columns) |
| Long press card | Enter multi-select mode |
| Tap card | Open bottom sheet detail |
| Scroll | Browse vertically |

### Triage mode (dedicated context — no sidebars)
| Gesture | Action |
|---------|--------|
| Swipe right | Save and next |
| Swipe left | Skip and next |
| Swipe up | Delete |
| Tap | Interact with tag chips |

### Intent mode (1-column scroll)
| Gesture | Action |
|---------|--------|
| Tap image | Open card-detail bottom sheet (same as grid) |
| Long press card | Enter multi-select mode |
| Scroll | Browse feed vertically |
| Pinch in | Return to grid at previous column count |

### Bottom sheet
| Gesture | Action |
|---------|--------|
| Drag up | Expand to full detail |
| Drag down | Close sheet |
| Long press section | Enter edit mode |

### Discoverability & onboarding hints

#### Design principles
- Ghost hand is a **simple translucent circle with subtle motion trail** — not a realistic hand, matches abstract editorial aesthetic
- Text labels use small caps section label style already in the app
- All animations are **1.5-2 seconds total** — not slow or patronizing
- Respects Android "reduce motion" setting — if enabled, show static text tooltip instead of animated hand
- Each hint triggers **exactly once**, tracked in local storage
- Hints **never stack** — only one hint per screen visit, the most important one
- If the user performs the gesture before the hint triggers, hint is marked as seen and never shows
- "Show tips" toggle in settings resets all hint states so they replay

#### Per-screen hints

**Home screen (first time with content):**
Ghost hand appears on left edge, slides right revealing sidebar ~30%, holds 1 second, releases back. Text: "swipe to filter". Fades out.

**Grid view (first entry):**
Ghost hand does a pinch-in gesture on the grid showing zoom from 3 to 2 columns, then pinches back. Text: "pinch to zoom". Fades out.

**Grid view (after ~30 seconds without long press):**
Subtle tooltip fades in near bottom: "long press to select multiple". No animation, just text. Disappears after 5 seconds or on any interaction.

**Bottom sheet (first open):**
Small upward arrow pulses gently twice near the drag handle. Text: "drag up for full detail". Disappears after first drag-up.

**Bottom sheet (after viewing a few cards without editing):**
Subtle tooltip near tag area: "long press to edit". Disappears on interaction.

**Intent mode (first time in 1 column):**
Subtle tooltip near top of feed: "tap to view detail • pinch in to return to grid". Fades out after 3 seconds or on first interaction.

**Triage (first card):**
Three ghost arrows appear simultaneously on the card: right arrow "save", left arrow "skip", up arrow "delete". All three fade out together after 2 seconds.

**Bulk upload review grid (first time):**
Ghost hand taps one thumbnail showing it dim with X overlay. Text: "tap to exclude". Fades out.

#### Persistent affordances
- **Subtle edge hint bar** — 4px wide on the left edge, permanently visible at low opacity (0.6), signaling the filter-sidebar swipe affordance.

#### Haptic feedback
- Vibration on every gesture activation — **toggleable in settings, off by default**
- Light tap: opening panels, selecting cards
- Medium: saving, applying tags
- Strong: deleting, mode changes

#### Settings
- **"Show tips"** toggle — resets all hint states, next visit to each screen replays the ghost hint
- **"Haptic feedback"** toggle

### Offline behavior
- Everything works offline except AI analysis
- AI analysis requests **queue locally** when offline
- Queue processes automatically when internet returns
- User sees "queued for analysis" status on pending cards
- No error state — seamless resume

---

## Accessibility

### Principles
- This is a visual app for image organization — full screen reader navigation is not the primary use case
- However: alt labels on all interactive elements, because low vision users with magnification, temporary TalkBack use, and good practice
- **WCAG AA contrast ratios are mandatory** — 4.5:1 for small text, 3:1 for large text against parchment background. Claude Code must validate every color pairing. No exceptions.

### Color
- Status and urgency use color but the bottom sheet always shows text labels — color is never the ONLY indicator of meaning
- **Colorblind-friendly theme** as a settings option that swaps the status/urgency palette to colorblind-safe alternatives
- All current color values should be validated against WCAG AA before shipping

### Touch targets
- **Minimum 44x44px** touch target on all interactive elements per Android guidelines
- Tag chips, filter chips, resonance icons, category icons all must meet this
- Actual visual size can be smaller if the tappable area is padded to 44px

### Motion
- Respect Android "reduce motion" accessibility setting
- If reduce motion is on: replace shake animation with static visual change (border highlight or color shift)
- Shake animation in edit mode should be subtle enough to not trigger motion sensitivity regardless

### Haptic feedback
- Togglable in settings — off by default respects user preference
- Three intensity levels when enabled

### Alt labels
- Every card in grid: "Screenshot: [category] category, resonance level [1/2/3], urgency [level], status [level]"
- Category icons: labeled with category name
- Resonance iris: labeled with level description
- All buttons and interactive elements labeled

---

## Technical notes

### Background screenshot detection
- Use Android FileObserver API via Expo — event-driven, not polling
- Battery impact negligible
- **Watch the Screenshots album explicitly** — typically `/DCIM/Screenshots/` or `/Pictures/Screenshots/`. Varies by device manufacturer.
- Onboarding should let user confirm or change which folder to watch
- App must be opened once + battery optimization disabled — handle in onboarding
- Additive only — does NOT replace native Android screenshot flow

### Duplicate detection
- Hash fingerprint per image before upload
- Fingerprint match = greyed out in review grid
- Queue tracks processed vs unprocessed, resume anytime

### Search
- Fuse.js fuzzy matching across all metadata
- Filters narrow first, search within filtered results

### Delete behavior
- Delete from library: undo toast 5 seconds
- Optional device deletion (Android permission required, confirmation dialog)

---

## Data model (Supabase)

```
screenshots
  id: uuid
  user_id: uuid
  device_file_path: string
  file_hash: string
  created_at: timestamp
  file_created_at: timestamp
  analyzed: boolean
  ai_reviewed: boolean
  local_only: boolean

  -- AI generated
  ai_typed_tags: jsonb[] -- array of {type, value} objects e.g. [{"type":"item","value":"dress"},{"type":"color","value":"black"}]
  ai_suggested_subjects: string[]
  ai_suggested_category: string
  ai_suggested_difficulty: string
  ai_suggested_time: string
  source_url: string (nullable) -- AI extracted/inferred from visible URLs, site layouts, product pages
  action_url: string (nullable) -- AI constructed search/action link
  action_url_type: string (nullable) -- tickets, directions, buy, recipe, listen, watch, read, search

  -- User set
  category: string
  subject: string
  urgency: string
  urgency_date: date (nullable)
  resonance: integer (1, 2, 3)
  difficulty: enum (beginner, intermediate, advanced) nullable
  time_to_complete: enum (quick, afternoon, full_day, multi_day, long_term) nullable
  status: enum (ready, supplies, research, in_progress, done) nullable
  manual_typed_tags: jsonb[] -- array of {type, value} or {value} (untyped) objects
  notes: text
  source_url_manual: string (nullable)
```

### Tag types reference
Valid tag types (display order): item, genre, cuisine, technique, style, material, color, season, occasion, mood, source, person, place. Untyped tags have no type field and display after all typed tags. -- user can manually add/edit URL
```

---

## Distribution
- **Local APK** for now — build via Expo, sideload directly. No store needed.
- Google Play ($25 one-time) only if public distribution is desired later
- Apple dev ($99/year) for iPhone (v2)

## Cost model
- Bulk onboarding: ~$0.003-0.005 per image — 5,000 images ≈ $15-25 one time
- Ongoing: ~$3-8/month
- Supabase + Vercel: free tier
- Distribution: $0 (local APK)

---

## Build phases

### Phase 1 — Foundation
- [ ] Project setup: React Native + Expo + Supabase + Vercel
- [ ] Auth (email or Google)
- [ ] Library grid UI (3-column, square, sharp corners, edge bleed)
- [ ] Card design with icons and iris
- [ ] Grid zoom (4/3/2 switching)
- [ ] Manual tagging interface
- [ ] Bottom sheet card detail
- [ ] Supabase sync

### Phase 2 — Bulk upload
- [ ] Gallery scanner + fingerprinting
- [ ] Duplicate detection
- [ ] Batch review grid with slider
- [ ] Claude API via Vercel
- [ ] Processing screen
- [ ] Bulk tagging from 4-col multi-select

### Phase 3 — Capture flow
- [ ] FileObserver background service
- [ ] Post-screenshot popup
- [ ] Analyze & Add / Add without AI flows
- [ ] Onboarding for permissions

### Phase 4 — Search & filter
- [ ] Sidebar with swipe gesture
- [ ] Multi-select filter chips
- [ ] Fuse.js integration

### Phase 5 — Triage & intent mode
- [ ] Triage entry + swipe interface
- [ ] Delete with undo + device deletion
- [ ] Single column scroll + sidebar
- [ ] Home page with category rows

### Phase 6 — Polish
- [ ] Themes (light + dark)
- [ ] Settings
- [ ] Onboarding
- [ ] Empty/error states
- [ ] Performance optimization
- [ ] Redaction tool

---

## Design decision log (for portfolio)

### Card shape: Square, no rounded corners
**Why:** Screenshots are rectangular. Rounded corners feel consumer-app, not reference tool. Sharp edges feel editorial. **Considered:** rounded corners (too soft), 3:4 ratio (wasted space).

### Grid zoom: 4/3/2/1 stepped
**Why:** Each level serves a distinct purpose — 4 for bulk, 3 for browse, 2 for detail, 1 for intent mode. **Considered:** fluid pinch (rejected for grid consistency), 3 levels only (added 4 for bulk tagging).

### Icons: Silhouette, drop shadow, no pill
**Why:** Pills added clutter. Silhouettes read faster at small sizes. Drop shadow ensures readability. **Considered:** thin line (disappeared on busy backgrounds), frosted glass pills (too much chrome).

### Resonance: Iris concentric circles
**Why:** Ties to Overlook name. Abstract, scales clearly, no words needed. **Considered:** moon phases (too literal), botanical growth (implied progression contradicts static resonance), lashed eyes (uncanny at small sizes), geometric with lashes (still creepy), watchtower (too architectural). Settled after testing 10+ variants.

### Status + Urgency: Top edge connected gradient
**Why:** Corner glows were noisy at scale. Separate brackets left ugly gap. Connected gradient reads as one signal strip. **Considered:** corner radials (too noisy), brackets (gap ugly), dots (not visible), removing status (rejected — planning needs it).

### No nav bar, full bleed, swipe sidebar
**Why:** One destination. Nav chrome competes with content. Swipe is native Android. **Considered:** bottom nav, top tabs, floating button (kept for home only).

### Warm cultural editorial direction
**Why:** Content is visual and personal. Parchment base, serif typography. **Considered:** Swiss grid (too clinical), dark default (user prefers light), skeuomorphic (dated).

### Privacy: opt-in, never auto-send
**Why:** Sensitive screenshots exist. Trust requires explicit control. **Considered:** auto-analyze (rejected), local AI (too heavy), opt-out (less trustworthy).

### Intent field: removed entirely
**Why:** Originally had Do/Inspire/Reference as a three-way intent tag. During refinement realized "Inspire" and "Reference" felt like the same thing (both are "look at later") and "Do" was too broad (buying, making, cooking, watching are all very different actions). Considered renaming to Act/Aspire/Archive but then realized urgency already captures actionability — something tagged "Today" is clearly actionable, "Someday" is clearly passive. Category handles the rest. Intent was a redundant layer adding a tagging step without adding filtering value. **Considered:** Act/Aspire/Archive (better names but still redundant), making it optional (half measures), single "actionable" flag (urgency already does this).

### Resonance higher than urgency in all UIs
**Why:** More personal and fundamental. Urgency changes. Resonance is how you felt. **Order:** Resonance → Urgency everywhere.

### Triage as expandable queues
**Why:** Listing every missing field felt like homework. Three clean queues: Untagged, Incomplete (expands), AI Unreviewed.

### Single column: scroll feed (no separate sidebar)
**Why:** Swipe horizontal loses comparison. Scroll + tags breaks visual flow. Originally added a swipe-from-right edit sidebar specifically for intent mode, but realized the existing card-detail bottom sheet (used in grid) already provides good detail UX — having two different ways to view detail across modes adds complexity without value. Tap-to-bottom-sheet is the single canonical detail view across grid + intent + any future mode. **Decided 2026-05-07.**

### Parchment over eggshell
**Why:** Original `#F4F1EC` too yellow. Parchment `#EFEEEA` more muted, editorial. **Tested 6 variants.**

### Stat display: dashed underline, serif numbers
**Why:** Boxed rows felt like settings page. Dashed underlines feel editorial. **Tested 5 layouts.**

### Batch slider as boxed component
**Why:** Needed to feel self-contained. Rounded border box, centered title, dot notches. **Refined from flat inline slider.**

### Typed tag system over flat tags
**Why:** Flat tags like "dress, black, summer, casual" give no hierarchy — you can't scan them meaningfully. Typed tags (item:dress, color:black, season:summer, occasion:casual) display general → specific automatically, enabling visual hierarchy without rigid tiers. **Considered:** fixed tier system per category (too rigid, every category has different relevant attributes), fully freeform tags (no hierarchy, hard to scan), fixed universal tiers (doesn't account for different category needs). AI returns typed tags, manual tags auto-type when obvious (colors, seasons, cuisines), ask when ambiguous, stay untyped when unknown.

---

## Mockup file reference
Design mockups in /mnt/user-data/outputs/:
- overlook-cards-v5.html — card design with iris and normalized icons
- overlook-cards-v6.html — edge bracket variant
- overlook-edge-test.html — edge treatment comparison
- overlook-bottomsheet.html — card detail bottom sheet
- overlook-home-v3.html — home page
- overlook-sidebar.html — filter/search sidebar
- overlook-screenshot-popup-v2.html — post-screenshot popup
- overlook-triage.html — triage entry + swipe
- overlook-bulk-v2.html — bulk upload (parchment, dashed stats, slider)
- overlook-intent-mode.html — intent mode options comparison
