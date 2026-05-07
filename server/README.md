# Overlook server

Tiny Vercel project that proxies the mobile app to the Claude vision API.
Lives in this folder so it can be deployed independently from the Expo app.

## Endpoints

### `POST /api/analyze`

Body:
```json
{ "image_base64": "<jpeg as base64>", "mime_type": "image/jpeg" }
```

Returns:
```json
{
  "category": "food",
  "subject": "Italian pasta recipe",
  "typed_tags": [{"type":"item","value":"recipe"},{"type":"cuisine","value":"Italian"}],
  "suggested_subjects": ["pasta","carbonara","weeknight dinner"],
  "urgency": null,
  "urgency_date": null
}
```

Sprint scope: omits `difficulty`, `time_to_complete`, `source_url`, `action_url` (they exist in CLAUDE.md but are cut for v1).

## Deploy (one-time setup)

1. Sign in to https://vercel.com with the same account that holds your repo
2. **Add New → Project**, pick the Overlook repo
3. Set **Root Directory** to `server`
4. Framework Preset: **Other**
5. Add environment variables:
   - `ANTHROPIC_API_KEY` — from console.anthropic.com (must be on a billing account that survives the Max → Pro switch)
   - `OVERLOOK_SHARED_SECRET` — any random string; the mobile app must send it as `x-overlook-secret` header
6. Click **Deploy**
7. Copy the deployed URL (e.g. `https://overlook-server-xyz.vercel.app`) into the Expo app's `.env` as `EXPO_PUBLIC_VERCEL_URL`

## Local dev

```bash
cd server
npm install
npm run dev
```

`vercel dev` will read `.env` and serve at http://localhost:3000.

## Auth model (sprint)

Soft secret only — the Expo app sends `x-overlook-secret` matching `OVERLOOK_SHARED_SECRET`. This is **not** strong auth; harden before exposing to the public (forward Supabase JWT, verify on server).
