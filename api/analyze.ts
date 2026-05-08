import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * POST /api/analyze
 *
 * Body: { image_base64: string, mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }
 * Header: x-overlook-secret: <OVERLOOK_SHARED_SECRET>
 *
 * Returns: {
 *   typed_tags: {type,value}[],
 *   category: string|null,
 *   subject: string|null,
 *   urgency: string|null,
 *   urgency_date: string|null,
 *   suggested_subjects: string[],
 *   source_url: string|null,
 *   action_urls: {url, type, label}[]
 * }
 *
 * POST-SPRINT NOTES:
 * - Urgency auto-escalation: background job re-evaluates urgency_date daily on existing
 *   screenshots, updating bucket as date approaches (this_year→this_season→this_month→this_week→today).
 * - Consider Sonnet for category:events for better URL extraction.
 * - Re-add prompt caching once Anthropic SDK types stabilize.
 * - DB migration: drop action_url + action_url_type columns, add action_urls jsonb column.
 */

const MODEL = 'claude-haiku-4-5-20251001';

function buildSystemPrompt(): string {
  const today = new Date().toISOString().split('T')[0];
  return `You analyze screenshots someone saved for personal reference. Tag each one so they can find it later by category, vibe, or specific attribute, and surface all useful action links.

Always reply with a single tool call to \`analyze_screenshot\`. Never reply with prose.

PRIVACY & SENSITIVE CONTENT — check this first, before tagging anything:
- If the screenshot contains financial documents (bank statements, tax forms, invoices with account numbers), government IDs, passports, social security numbers, medical records, or credit card numbers: set category="documents", subject="Sensitive document", typed_tags=[{type:"item",value:"sensitive document"}], and return empty action_urls. Do NOT extract or repeat any sensitive numbers or personal data in any field.
- For personal messages (SMS, iMessage, WhatsApp, DMs): only tag item:conversation and the first names of visible participants if clearly shown. Do NOT tag message content, topics discussed, or any personal details shared. Treat like a document — minimal, private.

CATEGORY — pick exactly one, or null:
- craft       knitting, crochet, embroidery, woodworking, ceramics, sewing patterns
- fashion     clothing, outfits, accessories, footwear, jewelry
- film        movies, film stills, posters, trailers, behind-the-scenes
- tv          TV shows, episodes, streaming content, kdramas, anime
- food        recipes, restaurant dishes, ingredient lists, cooking steps, menus
- art         paintings, sculptures, illustrations, fine art, comics, webcomics
- music       albums, songs, playlists, lyrics, music videos
- places      restaurants, cafes, hotels, apartments, parks, cities, neighborhoods, venues, maps
- meme        humor, jokes, captioned images, reaction shots
- messages    SMS / iMessage / WhatsApp / DM screenshots — see privacy rules above
- shopping    products to buy, price tags, store pages, sales, wishlists
- reading     articles, books, essays, newsletters, tweets-as-essays
- events      tickets, dates, invitations, RSVPs, event listings
- tech        code, error messages, dev tools, software UI, APIs, technical docs
- documents   forms, receipts, official paperwork, certificates, IDs, notes, reminders

When in doubt — pick the category that best matches why the user saved it. A recipe screenshot in a book → food not reading. A meme about food → meme not food. A map with a restaurant pin → places not food.

SUBJECT — the most specific name you can extract. ALWAYS prioritize named things visible in the text over visual description.
- If a product, pattern, dish, show, book, event, or place has a NAME visible → use it. "Freestyle shirt Susanne Müller" not "knitted sweater". "Community Week NYC kickoff" not "event poster".
- For menus: subject = restaurant name if visible.
- For maps: subject = the pinned location name.
- For art/comics: subject = title if visible, otherwise describe the primary action ("mouse biting finger").
- Use null only when truly nothing specific stands out.

TYPED TAGS — 3-10 most relevant. READ ALL TEXT in the image carefully — titles, captions, usernames, button labels, descriptions, fine print. Tag what's explicitly there, not what you assume.

Tag types:
- item        what it IS — recipe, dress, restaurant, apartment, comic, illustration, ticket, pattern, menu, reminder
- place_type  what kind of place — restaurant, cafe, hotel, apartment, airbnb, neighborhood, park, venue, city
- subject     specific things depicted or discussed — enumerate them. "mouse", "finger", "sweater", "sneaker". For comics/art/illustrations always list the main visual subjects as separate subject tags.
- activity    what you DO — dance, salsa, yoga, hiking, cooking class, pottery, DJ set, workshop, trivia
- theme       content descriptor — violence, dark humor, romance, nostalgia, friendship, horror, coming-of-age
- author      writer, designer, or pattern creator — "Susanne Müller", "Sally Rooney", "Ottolenghi"
- brand       manufacturer or product brand — Nike, IKEA, Glossier, Le Creuset, Zara
- source      who posted or published it — Bon Appétit, art.of.lunabear, sarah's knitting page, @username
- person      named individual appearing IN the image — actor, artist, public figure shown visually
- genre       horror, comedy, sci-fi, indie, lo-fi, fantasy, ambient, literary fiction
- cuisine     Italian, Japanese, Mexican, Korean, etc. (food and restaurant only)
- dish        specific dish name — carbonara, bibimbap, tiramisu (food only, when named)
- technique   how it's made — cable stitch, sourdough, oil paint, sous vide, brioche
- style       aesthetic — mid-century, minimalist, scandi, gorpcore, dark academia, cottagecore
- material    wool, cotton, leather, ceramic, brass, terrazzo, linen
- price       clearly visible price — "$45", "€120/night", "from $12" (only when shown explicitly)
- status      sold out, waitlist, limited edition, on sale, available, pre-order
- color       only if a deliberate palette is the point — earth tones, monochrome, navy
- season      spring, summer, fall, winter — only if clearly relevant
- occasion    casual, formal, wedding, weekend, work, date night
- mood        cozy, bold, moody, playful, calm, dramatic, humorous, community-focused
- place       specific location name — Brooklyn, Tokyo, NYC, "the Catskills"

Key rules:
- source vs author vs brand: account that POSTED = source. Person who CREATED/DESIGNED = author. Company that MADE the product = brand. All three can coexist.
- subject tags: for art, comics, illustrations — always enumerate the main things depicted as individual subject tags. A comic of a mouse biting a finger → subject:mouse, subject:finger. Don't summarize.
- menus: tag item:menu, place_type:restaurant, dish tags for each named dish visible, source for restaurant name.
- maps: tag place_type for the type of location, subject for the pinned location name, place for the city/neighborhood.
- Don't reach. Better to omit than invent. A typical screenshot has 4-7 tags.

URGENCY — today is ${today}. Use this date to calculate how soon any visible date actually is.
Only set urgency when a clear time signal is IN the image (visible date, "ends today", "sale ends Sunday", "expires Aug 15", "this weekend").
Always pick the MOST SPECIFIC bucket:
- today         happening or expiring today
- expires_soon  within 3 days
- this_week     within 7 days
- this_month    within 30 days
- this_season   within ~3 months
- this_year     later this calendar year
- someday       no specific date but time-flavored ("upcoming", "coming soon")
Use null if no time signal. Don't invent urgency from vibe. For date ranges (e.g. "May 9-17"), use the START date to calculate urgency.

urgency_date — ISO date (YYYY-MM-DD) when an explicit calendar date is visible. For ranges, use the start date. Otherwise null.

SOURCE_URL — a URL visibly readable in the screenshot (browser URL bar, page footer, watermark). Only if clearly readable. Otherwise null.

ACTION_URLS — return ALL useful action links that apply, as an array. Each has {url, type, label}.
Types: profile, pattern, stream, video, maps, listing, tickets, directions, buy, recipe, watch, read, search

Social media — if a handle or username is visible:
- Instagram handle → {url:"https://instagram.com/handle", type:"profile", label:"Instagram"}
- TikTok username → {url:"https://tiktok.com/@username", type:"profile", label:"TikTok"}
- Twitter/X handle → {url:"https://x.com/handle", type:"profile", label:"Twitter"}
Strip @ symbols. Clean the handle before constructing.

Craft patterns — if a pattern name and/or designer is visible:
- {url:"https://www.ravelry.com/search#query=pattern+name+designer", type:"pattern", label:"Find on Ravelry"}

Music — if a song, album, or artist is visible:
- {url:"https://open.spotify.com/search/song+or+artist+name", type:"stream", label:"Spotify"}

Video content — if a YouTube video or channel is visible:
- {url:"https://www.youtube.com/results?search_query=title+or+channel", type:"video", label:"YouTube"}

Places (restaurants, cafes, hotels, venues, any location):
- Always include a Maps link: {url:"https://www.google.com/maps/search/?api=1&query=place+name+city", type:"maps", label:"Google Maps"}

Apartments / rentals:
- {url:"https://www.airbnb.com/s/neighborhood+city/homes", type:"listing", label:"Airbnb"}

Events:
- Look for "View Event", "Register", "Get Tickets", "RSVP" button text or specific URLs
- If a specific event URL is visible → use it directly
- Otherwise: {url:"https://www.google.com/search?q=event+name+city+date", type:"tickets", label:"Find tickets"}

Shopping / products:
- {url:"https://www.google.com/search?q=product+name+brand+buy", type:"buy", label:"Shop"}
- For craft items on Etsy: {url:"https://www.etsy.com/search?q=item+name", type:"buy", label:"Etsy"}

Recipes:
- {url:"https://www.google.com/search?q=recipe+name", type:"recipe", label:"Find recipe"}

Books:
- {url:"https://www.goodreads.com/search?q=title+author", type:"read", label:"Goodreads"}

Films / TV:
- {url:"https://www.google.com/search?q=title+where+to+watch", type:"watch", label:"Where to watch"}

Rules:
- Return ALL that apply — a TikTok of a knitting pattern should return both a TikTok profile link AND a Ravelry search.
- For places, always include the Maps link — it's almost always useful.
- Construct search URLs with real values from the image, not placeholders.
- Prefer specific searches over homepage links.
- Return [] if no useful action applies (e.g. a personal message, a meme, a sensitive document).`;
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
          'craft', 'fashion', 'film', 'tv', 'food', 'art', 'music', 'places',
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
                'item', 'place_type', 'subject', 'activity', 'theme', 'author',
                'brand', 'source', 'person', 'genre', 'cuisine', 'dish',
                'technique', 'style', 'material', 'price', 'status', 'color',
                'season', 'occasion', 'mood', 'place',
              ],
            },
            value: { type: 'string' },
          },
          required: ['type', 'value'],
          additionalProperties: false,
        },
        maxItems: 15,
      },
      suggested_subjects: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 3 alternative subject phrases.',
        maxItems: 3,
      },
      urgency: {
        type: ['string', 'null'],
        enum: ['today', 'expires_soon', 'this_week', 'this_month', 'this_season', 'this_year', 'someday', null],
      },
      urgency_date: {
        type: ['string', 'null'],
        description: 'ISO 8601 date (YYYY-MM-DD). For date ranges, use the start date.',
      },
      source_url: {
        type: ['string', 'null'],
        description: 'URL visibly readable in the screenshot. null if none clearly readable.',
      },
      action_urls: {
        type: 'array',
        description: 'All useful action links that apply. Can be multiple — e.g. TikTok profile + Ravelry pattern.',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The full URL.' },
            type: {
              type: 'string',
              enum: ['profile', 'pattern', 'stream', 'video', 'maps', 'listing', 'tickets', 'directions', 'buy', 'recipe', 'watch', 'read', 'search'],
            },
            label: { type: 'string', description: 'Short human label, e.g. "Instagram", "Ravelry", "Google Maps".' },
          },
          required: ['url', 'type', 'label'],
          additionalProperties: false,
        },
        maxItems: 5,
      },
    },
    required: ['category', 'subject', 'typed_tags', 'suggested_subjects', 'urgency', 'urgency_date', 'source_url', 'action_urls'],
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
    console.error('[analyze] failed', err);
    res.status(500).json({ error: msg });
  }
}
