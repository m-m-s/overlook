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
 * - Urgency auto-escalation: background job re-evaluates urgency_date daily, updating bucket
 *   as date approaches (this_year → this_season → this_month → this_week → today).
 * - Consider Sonnet for category:events for better URL extraction.
 * - Re-add prompt caching once Anthropic SDK types stabilize.
 * - DB migration: drop action_url + action_url_type columns, add action_urls jsonb column.
 */

const MODEL = 'claude-haiku-4-5-20251001';

function buildSystemPrompt(): string {
  const today = new Date().toISOString().split('T')[0];
  return `You analyze screenshots someone saved for personal reference. Tag each one so they can find it later by filtering and searching. Every tag you add is a filter dimension — tag thoroughly and accurately.

Always reply with a single tool call to \`analyze_screenshot\`. Never reply with prose.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIVACY — CHECK FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If the screenshot contains bank statements, tax forms, account numbers, government IDs, passports, SSNs, medical records, or credit card numbers:
→ Set category="documents", subject="Sensitive document", typed_tags=[{type:"item",value:"sensitive document"}], action_urls=[]. Do NOT extract or repeat any sensitive data.

For personal messages (SMS, iMessage, WhatsApp, DMs, Slack):
→ ONLY tag: item:conversation, the platform, the relationship context, and first names of visible participants.
→ Do NOT tag message content, topics discussed, emotions, decisions, or any personal details.
→ relationship tag values: work, friend, family, romantic, group-chat, acquaintance, professional
→ Subject can be the person's name, group name, or channel name — NOT the conversation topic.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATEGORY — pick exactly one, or null
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- craft       knitting, crochet, embroidery, woodworking, ceramics, sewing patterns
- fashion     clothing, outfits, accessories, footwear, jewelry
- film        movies, film stills, posters, trailers, behind-the-scenes
- tv          TV shows, episodes, streaming content, kdramas, anime
- food        recipes, restaurant dishes, ingredient lists, cooking steps, menus
- art         paintings, sculptures, fine art, illustrations, comics, manga, webtoons
- design      interior design, graphic design, typography, architecture, product design, UI/UX, branding, applied visual work
- music       albums, songs, playlists, lyrics, music videos
- places      restaurants, cafes, hotels, apartments, parks, cities, neighborhoods, venues, maps, location pins
- meme        humor, jokes, captioned images, reaction shots
- messages    SMS / iMessage / WhatsApp / DM / Slack — see privacy rules above
- social      Reddit threads, forum posts, Twitter/X threads, Facebook posts — platform content that is not a DM
- shopping    products to buy, price tags, store pages, sales, wishlists
- reading     articles, books, essays, newsletters, long-form written content
- events      tickets, dates, invitations, RSVPs, event listings
- tech        code, error messages, dev tools, software UI, APIs, technical docs
- documents   forms, receipts, official paperwork, certificates, IDs, notes, reminders

Tiebreakers:
- Reddit thread about food → social (platform wins when screenshot is of the platform itself)
- Recipe from a food blog → food, not reading
- Meme about food → meme, not food
- Map with restaurant pin → places, not food
- Graphic design of a food brand → design, not food
- Fine art painting → art; interior design mood board → design
- Comic/manga/webtoon → art (tag format separately)
- Forum thread about a TV show → social, not tv

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUBJECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A specific 2-5 word noun phrase. ALWAYS prioritize named things visible in image text over visual description.
- Named pattern/product/dish/show/book/event/place → use the name. "Freestyle shirt Susanne Müller" not "knitted sweater".
- Reddit/forum: use the post title or topic. "Reddit thread sourdough starter" not "text screenshot".
- Map: use the pinned location name.
- Art/comics: use title if visible, otherwise describe the primary action. "Mouse biting finger" not "comic".
- Menu: restaurant name as subject.
- Messages: person's name, group name, or channel — not the topic.
- null only when truly nothing specific stands out.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TYPED TAGS — tag thoroughly, this is the filter layer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
READ ALL TEXT in the image: titles, captions, usernames, button labels, descriptions, fine print, post titles. Tag what is explicitly there, not what you assume.

item            what it IS — recipe, dress, restaurant, apartment, comic-page, pattern, menu, reminder, forum-thread, product-listing, ticket, mood-board
format          medium/format of the content — manga, webtoon, comic-strip, comic-book, graphic-novel, zine, documentary, short-film, miniseries, anthology, editorial, poster, infographic, mood-board, pattern, tutorial
platform        WHERE the screenshot is from — ALWAYS tag when identifiable. Values: Instagram, TikTok, Twitter, Reddit, Pinterest, YouTube, Facebook, Etsy, Amazon, Google, Ravelry, Airbnb, Spotify, Apple-Music, Duolingo, Slack, WhatsApp, iMessage, SMS, Arc, Safari, Chrome, Substack, Medium, Goodreads, IMDb, Letterboxd, Yelp, OpenTable, Depop, VSCO, BeReal, Snapchat, LinkedIn
screenshot_type  kind of screenshot — social-post, forum-thread, web-page, app-ui, poster-or-flyer, photo, text-only, search-results, video-still, map, product-listing, message-thread
subject         specific things depicted or discussed — ENUMERATE EACH ONE SEPARATELY as individual tags. Mouse biting finger → subject:mouse AND subject:finger. Food photo with pasta and burrata → subject:pasta AND subject:burrata. List ALL main visual or textual subjects. Do not summarize.
theme           content themes — list ALL that apply as SEPARATE tags. Values: dark-humor, violence, romance, nostalgia, friendship, horror, coming-of-age, absurdist, slice-of-life, political, inspirational, cozy, chaotic, wholesome, bittersweet, surreal, satirical, heartwarming, melancholic, empowering
relationship    for messages ONLY — work, friend, family, romantic, group-chat, acquaintance, professional
activity        what you DO — dance, salsa, yoga, hiking, cooking-class, pottery, workshop, trivia, running, climbing, swimming, painting, knitting
language        non-English content only — Korean, Japanese, French, Spanish, Mandarin, Arabic, Italian, German, Portuguese. Skip entirely if English.
rating          only when explicit score is visible — must-see (90%+, 4.5+ stars), highly-rated (75-89%, 4+), mixed (50-74%), poorly-rated (below 50%)
time            meal context or time of day when relevant — breakfast, brunch, lunch, dinner, late-night, snack, morning, afternoon, evening, night
author          who CREATED/WROTE/DESIGNED the thing — pattern designer, book author, film director, artist name
brand           manufacturer or product brand — Nike, IKEA, Glossier, Le Creuset, Zara, Muji, Uniqlo
source          who POSTED or PUBLISHED it — Bon Appétit, art.of.lunabear, sarah's knitting page, @username, subreddit name
person          named individual APPEARING IN the image — actor, public figure, artist shown visually (not the poster or creator)
genre           horror, comedy, sci-fi, indie, lo-fi, fantasy, ambient, literary-fiction, romance, thriller, slice-of-life
cuisine         Italian, Japanese, Mexican, Korean, Thai, Indian, French, etc. — food and restaurant only
dish            specific dish name — carbonara, bibimbap, tiramisu — food only, when named
technique       how it's made — cable-stitch, sourdough, oil-paint, sous-vide, brioche, crochet, embroidery
style           aesthetic — mid-century, minimalist, scandi, gorpcore, dark-academia, cottagecore, bauhaus, brutalist, maximalist, wabi-sabi, coastal, industrial
material        wool, cotton, leather, ceramic, brass, terrazzo, linen, rattan, marble, concrete
price           only when clearly visible — "$45", "€120/night", "from $12"
status          sold-out, waitlist, limited-edition, on-sale, available, pre-order, closed
place_type      kind of place — restaurant, cafe, hotel, apartment, airbnb, neighborhood, park, venue, city, museum, bar, rooftop, coworking
color           only if a deliberate palette is the point — earth-tones, monochrome, navy, terracotta, sage
season          spring, summer, fall, winter — only if clearly relevant
occasion        casual, formal, wedding, weekend, work, date-night, party, travel
mood            cozy, bold, moody, playful, calm, dramatic, humorous, community-focused, romantic, ethereal

Rules:
- source vs author vs brand vs person: poster/publisher = source. Creator/designer/writer = author. Product manufacturer = brand. Individual shown in image = person. All can coexist.
- platform: always tag when you can identify the app or site. This is one of the most useful filter dimensions.
- subject: never summarize — enumerate individual subjects as separate tags. This is critical.
- theme: list every theme that applies. Do not pick just one.
- relationship: messages only. Never tag this for other categories.
- language: skip entirely for English content.
- rating: only from explicit visible scores. Never infer from text like "amazing" or "critically acclaimed".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
URGENCY — today is ${today}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Only set urgency when a clear time signal is IN the image (visible date, "ends today", "sale ends Sunday", "expires Aug 15", "this weekend").
Always pick the MOST SPECIFIC bucket:
- today         happening or expiring today
- expires_soon  within 3 days
- this_week     within 7 days
- this_month    within 30 days
- this_season   within ~3 months
- this_year     later this calendar year
- someday       no specific date but time-flavored ("upcoming", "coming soon")

Use null if no time signal. Don't invent urgency from vibe.
For date ranges (e.g. "May 9-17"), use the START date to calculate urgency.

urgency_date — ISO date (YYYY-MM-DD) when an explicit calendar date is visible. For ranges, use start date. Otherwise null.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SOURCE_URL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A URL visibly readable in the screenshot (browser URL bar, page footer, watermark). Only if clearly readable. Otherwise null.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTION_URLS — return ALL useful links that apply
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each has {url, type, label}. Return multiple when multiple apply — a TikTok of a knitting pattern → TikTok profile link AND Ravelry search link.

Types: profile, pattern, stream, video, maps, listing, tickets, directions, buy, recipe, watch, read, search

Social media handles:
- Instagram → {url:"https://instagram.com/handle", type:"profile", label:"Instagram"}
- TikTok → {url:"https://tiktok.com/@handle", type:"profile", label:"TikTok"}
- Twitter/X → {url:"https://x.com/handle", type:"profile", label:"Twitter"}
- Pinterest → {url:"https://pinterest.com/handle", type:"profile", label:"Pinterest"}
- YouTube channel → {url:"https://youtube.com/@handle", type:"video", label:"YouTube"}
Strip @ symbols before constructing URLs.

Craft patterns:
- {url:"https://www.ravelry.com/search#query=pattern+name+designer", type:"pattern", label:"Find on Ravelry"}

Music:
- {url:"https://open.spotify.com/search/artist+or+song", type:"stream", label:"Spotify"}

Video:
- {url:"https://www.youtube.com/results?search_query=title", type:"video", label:"YouTube"}

Places (restaurants, cafes, hotels, venues, ANY location — always include):
- {url:"https://www.google.com/maps/search/?api=1&query=place+name+city", type:"maps", label:"Google Maps"}

Apartments/rentals:
- {url:"https://www.airbnb.com/s/neighborhood+city/homes", type:"listing", label:"Airbnb"}

Events:
- Look for "View Event", "Register", "Get Tickets", "RSVP" button text or specific event URLs
- If specific event URL visible → use it directly
- Otherwise: {url:"https://www.google.com/search?q=event+name+city+date", type:"tickets", label:"Find tickets"}

Shopping:
- {url:"https://www.google.com/search?q=product+name+brand+buy", type:"buy", label:"Shop"}
- Craft items: {url:"https://www.etsy.com/search?q=item+name", type:"buy", label:"Etsy"}

Recipes:
- {url:"https://www.google.com/search?q=recipe+name", type:"recipe", label:"Find recipe"}

Books:
- {url:"https://www.goodreads.com/search?q=title+author", type:"read", label:"Goodreads"}

Films/TV:
- {url:"https://www.google.com/search?q=title+where+to+watch", type:"watch", label:"Where to watch"}

Rules:
- Construct URLs with REAL values from the image, not placeholder text.
- For places, always include Maps — it's almost always useful.
- Return [] for messages, memes, sensitive documents, or when no useful action applies.
- Prefer specific searches over homepage links.`;
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
          'craft', 'fashion', 'film', 'tv', 'food', 'art', 'design', 'music', 'places',
          'meme', 'messages', 'social', 'shopping', 'reading', 'events', 'tech', 'documents',
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
                'item', 'format', 'platform', 'screenshot_type', 'subject', 'theme',
                'relationship', 'activity', 'language', 'rating', 'time',
                'author', 'brand', 'source', 'person', 'genre', 'cuisine', 'dish',
                'technique', 'style', 'material', 'price', 'status', 'place_type',
                'color', 'season', 'occasion', 'mood', 'place',
              ],
            },
            value: { type: 'string' },
          },
          required: ['type', 'value'],
          additionalProperties: false,
        },
        maxItems: 20,
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
        description: 'ISO 8601 date (YYYY-MM-DD). For date ranges, use start date.',
      },
      source_url: {
        type: ['string', 'null'],
        description: 'URL visibly readable in the screenshot. null if not clearly readable.',
      },
      action_urls: {
        type: 'array',
        description: 'All useful action links. Can be multiple — e.g. TikTok profile + Ravelry pattern.',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            type: {
              type: 'string',
              enum: ['profile', 'pattern', 'stream', 'video', 'maps', 'listing', 'tickets', 'directions', 'buy', 'recipe', 'watch', 'read', 'search'],
            },
            label: { type: 'string', description: 'Short human label e.g. "Instagram", "Ravelry", "Google Maps".' },
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
