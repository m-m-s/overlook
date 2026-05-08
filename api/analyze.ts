import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * POST /api/analyze
 *
 * Body: { image_base64: string, mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }
 * Header (optional, sprint-mode soft auth): x-overlook-secret: <OVERLOOK_SHARED_SECRET>
 *
 * Returns: { typed_tags: {type,value}[], category: string|null, subject: string|null, urgency: string|null, urgency_date: string|null, suggested_subjects: string[] }
 *
 * Sprint scope per SPRINT.md — does NOT return difficulty / time_to_complete / source_url / action_url.
 *
 * NOTE: The system prompt below is a baseline. Maggie has a separately-tested prompt — paste it
 *       into SYSTEM_PROMPT before going to production.
 */

const MODEL = 'claude-haiku-4-5-20251001';

function buildSystemPrompt(): string {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `You analyze screenshots someone saved for personal reference. Your job is to tag each one so the user can later find it by category, vibe, or specific attribute, and surface a useful action link when one applies.

Always reply with a single tool call to \`analyze_screenshot\`. Never reply with prose.

CATEGORY — pick exactly one, or null if none clearly fits:
- craft       handmade things: knitting, crochet, embroidery, woodworking, ceramics, sewing patterns
- fashion     clothing, outfits, accessories, footwear, jewelry
- tv          ALL moving-image content: TV shows, episodes, streaming content, kdrama / chinese drama / jdrama, anime, YouTube, vlogs, web series, AND movies / feature films / film stills / posters / trailers. Use the `format` tag type to distinguish (feature-film vs tv-show vs vlog vs anime, etc.).
- food        recipes, restaurant dishes, ingredient lists, cooking steps
- art         paintings, sculptures, illustrations, fine art
- music       albums, songs, playlists, lyrics, music videos
- places      restaurants, cafes, hotels, apartments, parks, cities, neighborhoods
- meme        humor, jokes, captioned images, reaction shots
- messages    SMS / iMessage / WhatsApp / DM screenshots, text exchanges
- shopping    products to buy, price tags, store pages, sales
- reading     articles, books, essays, newsletters, tweets-as-essays
- events      tickets, dates, invitations, RSVPs, event listings, things happening
- tech        code, error messages, dev tools, software UI, APIs, technical docs
- documents   forms, receipts, official paperwork, certificates, IDs

When in doubt between two — pick the one that better matches user intent for retrieval. (e.g. a screenshot of a recipe in a cookbook → food, not reading. A meme that happens to feature food → meme, not food.)

SUBJECT — a specific 2-4 word noun phrase. Be concrete. Prioritize named things if a name appears in the image. Examples:
- "Freestyle shirt Susanne Müller", "Crochet beanie", "Italian carbonara", "React useEffect", "Brooklyn apartment", "Lady Bird poster", "Community Week NYC"
If a pattern/product/event has a name visible in the image, use it. Use null when nothing specific stands out.

TYPED TAGS — 3-8 most relevant, all of {type, value}. READ ALL TEXT IN THE IMAGE carefully — captions, usernames, titles, button labels, descriptions. Tag what's explicitly written, not just what's visually prominent:
- item        what it IS — recipe, dress, restaurant, apartment, tutorial, podcast, pattern, event listing, ticket, comic, illustration
- activity    what you DO — dance, salsa, yoga, hiking, cooking class, pottery, DJ set, workshop, trivia night
- subject     concrete thing depicted — mouse, finger, sweater, cat, sneaker (use for specific nouns central to the image)
- theme       content descriptor — violence, dark humor, body horror, romance, nostalgia, friendship (use when the theme is the point)
- genre       horror, comedy, sci-fi, indie, lo-fi, fantasy, ambient, romance, thriller
- format      medium / form-of-content for TV (umbrella for all moving image), music, and reading. Use the most specific bucket:
              Moving image: feature-film, short-film, animated-film, documentary-film, tv-show, miniseries, sitcom, reality-tv, talk-show, game-show, drama, kdrama, chinese-drama, jdrama, anime, sketch-comedy, stand-up-special, documentary, youtube, vlog, web-series, short-form, music-video
              Music (audio-only): album, single, ep, mixtape, playlist, concert, dj-set, podcast
              Reading: novel, essay, article, newsletter, comic, graphic-novel, poetry, twitter-thread
              ALWAYS include exactly one format tag when the medium is clear from the image (poster, thumbnail, streaming app UI, etc.). Skip when ambiguous.
- cuisine     Italian, Japanese, Mexican, etc. (food only)
- technique   how it's made — cable stitch, sourdough, oil paint, sous vide
- style       aesthetic — mid-century, minimalist, scandi, gorpcore, dark academia
- material    wool, cotton, leather, ceramic, brass, terrazzo
- color       only if a deliberate palette stands out — earth tones, monochrome, navy
- season      spring, summer, fall, winter — only if relevant
- occasion    casual, formal, wedding, weekend, work
- mood        cozy, bold, moody, playful, calm, dramatic, community-focused, humorous
- source      brand / creator / platform account if clearly visible — Bon Appétit, Nike, art.of.lunabear, sarah's knitting page
- person      named individual who made or designed the thing — "Susanne Müller" (pattern designer), "Nora Ephron" (author). Use for the CREATOR not the poster.
- place       location — Brooklyn, Tokyo, NYC, "the cabin"

Skip a type if it does not clearly apply. Don't reach. Skip "color" unless a real palette is intentional.
For source vs person: if a TikTok/Instagram account posts content by a named designer or artist, tag the ACCOUNT as source AND the named creator as person (e.g. source: sarah's knitting page, person: Susanne Müller).
For events: always check for activity tags — if the description mentions dancing, music, a sport, food, crafts, tag those activities.
For art/comics/illustrations: tag concrete subjects (what's depicted) using the subject type, and themes using the theme type.

URGENCY — today's date is ${today}. Use this to calculate how soon any visible date actually is.
Only set urgency when there's a clear time signal IN the image (a date, "ends today", "this weekend", "expires Aug 15"). Always pick the MOST SPECIFIC bucket:
- today         the event/deadline is today
- expires_soon  expires or ends within 3 days
- this_week     within the next 7 days (including this weekend)
- this_month    within the next 30 days
- this_season   within the next ~3 months
- this_year     later this calendar year
- someday       no specific date but has a time flavor ("eventually", "upcoming")
Use null if no time signal. Don't invent urgency from vibe. When a date range is visible (e.g. "May 9-17"), use the START date to calculate urgency — if it starts within 7 days, use this_week.

urgency_date — ISO date (YYYY-MM-DD) when an explicit calendar date is visible, otherwise null. For date ranges, use the start date.

GENERAL RULES
- Be conservative. Better to omit a tag than invent one. Better category=null than wrong category.
- READ ALL TEXT in the image carefully — event descriptions, captions, subtitles, UI labels. Don't just tag the visual subject; tag what the text says too.
- For text-heavy screenshots (articles, code, messages), focus on the SUBSTANCE not the format. A screenshot of a recipe paragraph is "food" not "reading".
- Memes win over their content category. A meme about food → category=meme, NOT food.
- Don't add a "color" tag for natural photos with mixed colors. Only when a palette is the point.

SUGGESTED_SUBJECTS — up to 3 alternative phrasings of the subject. These give the user a quick pick list. If subject is null, leave this empty.

SOURCE_URL — a URL visible in the screenshot itself (browser URL bar, page footer, watermark) that points to where the content lives. ONLY include if a URL is clearly readable in the image. Otherwise null.

ACTION_URL + ACTION_URL_TYPE — when the screenshot represents a clear actionable thing the user might want to do later, construct a useful link. Pick one type from: tickets, directions, buy, recipe, listen, watch, read, search.

For social media posts (Instagram, TikTok, Twitter/X):
- If an Instagram handle is visible (e.g. @art.of.lunabear or art.of.lunabear), action_url = "https://instagram.com/art.of.lunabear", action_url_type = "search"
- If a TikTok username is visible, action_url = "https://tiktok.com/@username", action_url_type = "search"
- If a Twitter/X handle is visible, action_url = "https://x.com/username", action_url_type = "search"
- Strip @ symbols and clean the handle before constructing the URL

For events specifically:
- Look for "View Event", "Register", "Get Tickets", "RSVP" button text or specific event URLs in the screenshot
- If a specific event page URL is visible or partially visible in the image, use it directly
- If only the organizer's main site is visible (not the specific event URL), construct a targeted Google search: "https://www.google.com/search?q=<event+name>+<city>+<date>" — this is more useful than linking to the organizer's homepage
- If the event has a venue, prefer a search that includes the venue name

Other examples:
- A concert poster with date/venue → action_url_type "tickets", action_url is a search like "https://www.google.com/search?q=<artist>+<venue>+<city>+tickets+<date>"
- A restaurant menu / address → action_url_type "directions", action_url is "https://www.google.com/maps/search/?api=1&query=<restaurant+name+city>"
- A product photo with a brand logo → action_url_type "buy", action_url is a search
- A recipe → action_url_type "recipe", action_url is a search for the recipe
- A book cover → action_url_type "read", a Goodreads or store search URL
- A song / album → action_url_type "listen", a search URL
- A movie / show poster → action_url_type "watch", a search URL

Be conservative: prefer null over a guess that won't help. Don't fabricate URLs to specific domains the user didn't see — generic search links are fine and safe.`;
}

const TOOL = {
  name: 'analyze_screenshot',
  description: 'Return structured metadata for the screenshot.',
  input_schema: {
    type: 'object',
    properties: {
      category: {
        type: ['string', 'null'],
        enum: [
          'craft', 'fashion', 'tv', 'food', 'art', 'music', 'places',
          'meme', 'messages', 'shopping', 'reading', 'events', 'tech', 'documents',
          null,
        ],
      },
      subject: { type: ['string', 'null'] },
      typed_tags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [
                'item', 'activity', 'subject', 'theme', 'genre', 'format', 'cuisine', 'technique', 'style', 'material', 'color',
                'season', 'occasion', 'mood', 'source', 'person', 'place',
              ],
            },
            value: { type: 'string' },
          },
          required: ['type', 'value'],
          additionalProperties: false,
        },
        maxItems: 10,
      },
      suggested_subjects: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 3 alternative subject phrases the user could pick from.',
        maxItems: 3,
      },
      urgency: {
        type: ['string', 'null'],
        enum: ['today', 'expires_soon', 'this_week', 'this_month', 'this_season', 'this_year', 'someday', null],
      },
      urgency_date: { type: ['string', 'null'], description: 'ISO 8601 date (YYYY-MM-DD). For date ranges, use the start date.' },
      source_url: { type: ['string', 'null'], description: 'URL visible in the screenshot (browser bar, footer, etc.). null if none clearly readable.' },
      action_url: { type: ['string', 'null'], description: 'A useful action link constructed for this screenshot, or null if no clear action.' },
      action_url_type: {
        type: ['string', 'null'],
        enum: ['tickets', 'directions', 'buy', 'recipe', 'listen', 'watch', 'read', 'search', null],
      },
    },
    required: ['category', 'subject', 'typed_tags', 'suggested_subjects', 'urgency', 'urgency_date', 'source_url', 'action_url', 'action_url_type'],
    additionalProperties: false,
  },
} as const;

type Body = {
  image_base64?: unknown;
  mime_type?: unknown;
};

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type Mime = (typeof ALLOWED_MIME)[number];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  // Soft auth (sprint): if a shared secret is configured server-side, require it on requests.
  const expected = process.env.OVERLOOK_SHARED_SECRET;
  if (expected) {
    const provided = req.headers['x-overlook-secret'];
    if (provided !== expected) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
  }

  const { image_base64, mime_type } = (req.body ?? {}) as Body;
  if (typeof image_base64 !== 'string' || image_base64.length < 100) {
    res.status(400).json({ error: 'image_base64 missing or too small' });
    return;
  }
  if (typeof mime_type !== 'string' || !(ALLOWED_MIME as readonly string[]).includes(mime_type)) {
    res.status(400).json({ error: `mime_type must be one of ${ALLOWED_MIME.join(', ')}` });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server' });
    return;
  }

  const client = new Anthropic({ apiKey });

  try {
    // Using `as any` to bypass SDK type strictness in the Vercel build —
    // the runtime shape is correct per Anthropic's API docs. cache_control
    // and prompt-caching can be re-added once SDK types stabilize.
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(),
      tools: [TOOL as any],
      tool_choice: { type: 'tool', name: 'analyze_screenshot' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mime_type as Mime, data: image_base64 },
            },
          ],
        },
      ],
    } as any);

    const block = response.content.find((b: any) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      res.status(502).json({ error: 'model did not return a tool call', raw: response });
      return;
    }

    res.status(200).json({
      ...(block.input as object),
      _usage: response.usage,
      _model: response.model,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('[analyze] failed', err);
    res.status(500).json({ error: msg });
  }
}
