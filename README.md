# Overlook

Personal screenshot organization app for Android. See [CLAUDE.md](./CLAUDE.md) for the full product spec, [SPRINT.md](./SPRINT.md) for the active sprint scope, and [NOTES.md](./NOTES.md) for ongoing decisions and gotchas.

## What's where

```
app/             — Expo Router screens (currently a single library route)
components/      — Card, ScreenshotDetail, Iris, CategoryIcon, FilterBar, etc.
lib/             — supabase client, auth, uploads, screenshots, analyze (vision API client)
api/             — Vercel serverless function: Claude vision API proxy
supabase/
  migrations/    — SQL migrations to run via Supabase SQL editor
vercel.json      — config for the api/ function (maxDuration etc.)
eas.json         — EAS Build profiles for the production APK
```

## First-time setup (read top to bottom — order matters)

### 1. Install Node deps

```bash
npm install
```

### 2. Set up Supabase

You should already have a Supabase project. If not, create one at https://supabase.com.

**Run the database migration:**

1. Open `supabase/migrations/0001_initial.sql` in your editor and copy everything.
2. In your Supabase project, go to **SQL Editor** → **New query**, paste, and click **Run**. You should see "Success. No rows returned." This creates the `screenshots` table, sets up Row Level Security (so each user only sees their own screenshots), and creates the private `screenshots` storage bucket.

**Add the magic-link redirect URL:**

1. In Supabase, go to **Authentication** → **URL Configuration**.
2. Under **Redirect URLs**, click **Add URL** and add `overlook://`. Save.

(This tells Supabase to allow the magic-link email to redirect back into the Overlook app.)

**Copy your project keys:**

1. **Project Settings** (gear icon, bottom-left) → **API**.
2. Copy the **Project URL** and the **anon public** key.

### 3. Set up the Vercel function (for AI tagging)

The `api/` folder at the repo root is a Vercel serverless function that proxies image analysis to Claude. The Anthropic API key never lives in the mobile app.

1. Go to https://vercel.com → **Add New** → **Project** → import the `overlook` GitHub repo.
2. Leave **Root Directory** as the default (`.`). Vercel auto-detects `api/*.ts` files at the root.
3. **Framework Preset:** Other.
4. Add environment variables:
   - `ANTHROPIC_API_KEY` — your Anthropic console key.
   - `OVERLOOK_SHARED_SECRET` — any random string (`openssl rand -hex 32`). The mobile app will send this in a header to prove it's the right caller.
5. Click **Deploy**.
6. Copy the deployed URL (looks like `https://overlook-xyz.vercel.app`).
7. Verify it's live by hitting `https://your-deployment.vercel.app/api/analyze` in a browser — should return `{"error":"method not allowed"}` (because GET ≠ POST). That means the function is mounted.

### 4. Create the local `.env`

Create a file `.env` in this directory (it's git-ignored — never commit it):

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY

EXPO_PUBLIC_VERCEL_URL=https://overlook-xyz.vercel.app
EXPO_PUBLIC_OVERLOOK_SECRET=THE_SAME_RANDOM_STRING_FROM_VERCEL
```

### 5. Run the app on your phone

1. Install **Expo Go** on your Android phone from Play Store (if you haven't).
2. In this directory: `npx expo start`.
3. A QR code appears in the terminal. Open Expo Go on your phone, tap **Scan QR code**, point it at the terminal.
4. The app should load on your phone. Tap **send magic link** with your email, check your email on the phone, tap the link — it'll bounce you back to the app and you'll be signed in.
5. Tap **upload screenshots** → pick a few from your gallery → they appear in the grid and start getting AI-tagged in the background.

## Daily dev loop

```bash
git pull            # always before starting a session
npx expo start      # phone via Expo Go
# code…
git add -A && git commit -m "..." && git push
```

If you change `app.json`, native config, or install a new native module, you may need to restart Expo Go and re-scan the QR.

## Local-only / dev mode

If `EXPO_PUBLIC_SUPABASE_URL` is missing the app falls back to local-only mode: picked images stay in memory and don't sync. Useful for UI-only work.

## Multi-machine workflow

The repo is the source of truth. On any machine: clone, `npm install`, drop in your `.env`, run. The `.env` is intentionally not committed — copy it manually between machines (or use a secret manager if you set one up).

## Production APK (when ready to ship)

EAS Build runs in the cloud and produces a sideloadable `.apk` you transfer to your phone.

```bash
# One-time: log into Expo
npx eas-cli@latest login

# One-time per project: link this folder to an EAS project
npx eas-cli@latest init

# Build the production APK
npx eas-cli@latest build -p android --profile production
```

After it finishes, EAS gives you a download link. Open it on your phone, tap to install (you'll need to allow "Install unknown apps" once).

`eas.json` defines three profiles: `development` (with dev client, for FileObserver work later), `preview` (signed APK for testing), `production` (current shipping target). Change `production.channel` if you set up OTA updates later.
