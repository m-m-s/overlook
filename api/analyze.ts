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

const SYSTEM_PROMPT = `You analyze screenshots someone saved for personal reference. Your job is to tag each one so the user can later find it by category, vibe, or specific attribute.

Always reply with a single tool call to \`analyze_screenshot\`. Never reply with prose.

CATEGORY — pick exactly one, or null if none clearly fits:
- craft       handmade things: knitting, crochet, embroidery, woodworking, ceramics, sewing patterns
- fashion     clothing, outfits, accessories, footwear, jewelry
- film        movies, film stills, posters, trailers, behind-the-scenes
- tv          TV shows, episodes, streaming content, kdramas, anime
- food        recipes, restaurant dishes, ingredient lists, cooking steps
- art         paintings, sculptures, illustrations, fine art
- music       albums, songs, playlists, lyrics, music videos
- places      restaurants, cafes, hotels, apartments, parks, cities, neighborhoods
- meme        humor, jokes, captioned images, reaction shots
- messages    SMS / iMessage / WhatsApp / DM screenshots, text exchanges
- shopping    products to buy, price tags, store pages, sales
- reading     articles, books, essays, newsletters, tweets-as-essays
- events      tickets, dates, invitations, RSVPs
- tech        code, error messages, dev tools, software UI, APIs, technical docs
- documents   forms, receipts, official paperwork, certificates, IDs

When in doubt between two — pick the one that better matches user intent for retrieval. (e.g. a screenshot of a recipe in a cookbook → food, not reading. A meme that happens to feature food → meme, not food.)

SUBJECT — a specific 2-4 word noun phrase. Be concrete. Examples:
- "Crochet beanie", "Italian pasta recipe", "Italian carbonara", "React useEffect", "Brooklyn apartment", "Lady Bird poster", "iPhone 17 launch", "Apartment in Tokyo", "weeknight dinner ideas"
Use null when nothing specific stands out (e.g. a generic memes / reaction).

TYPED TAGS — 3-6 most relevant, all of {type, value}:
- item        what it IS — recipe, dress, restaurant, apartment, tutorial, podcast, pattern
- genre       horror, comedy, sci-fi, indie, lo-fi, fantasy, ambient
- cuisine     Italian, Japanese, Mexican, etc. (food only)
- technique   how it's made — cable stitch, sourdough, oil paint, sous vide
- style       aesthetic — mid-century, minimalist, scandi, gorpcore, dark academia
- material    wool, cotton, leather, ceramic, brass, terrazzo
- color       only if a deliberate palette stands out — earth tones, monochrome, navy
- season      spring, summer, fall, winter — only if relevant
- occasion    casual, formal, wedding, weekend, work
- mood        cozy, bold, moody, playful, calm, dramatic
- source      brand / creator / site if clearly visible — Bon Appétit, Nike, IKEA
- person      who it's for / about — only when a specific name appears in the image
- place       location — Brooklyn, Tokyo, "the cabin"

Skip a type if it does not clearly apply. Don't reach. A typical screenshot has 3-5 tags. Skip "color" unless a real palette is intentional. Skip "source" unless a brand/site/creator is clearly named.

URGENCY — only when there's a clear time signal IN the image (date visible, "ends today", "this weekend", "expires Aug 15"):
today, expires_soon, this_week, this_month, this_season, this_year, someday.
Use null if no time signal. Don't invent urgency from vibe.

urgency_date — ISO date (YYYY-MM-DD) when an explicit calendar date is visible, otherwise null.

GENERAL RULES
- Be conservative. Better to omit a tag than invent one. Better category=null than wrong category.
- For text-heavy screenshots (articles, code, messages), focus on the SUBSTANCE not the format. A screenshot of a recipe paragraph is "food" not "reading".
- Memes win over their content category. A meme about food → category=meme, NOT food.
- Don't add a "color" tag for natural photos with mixed colors. Only when a palette is the point.

SUGGESTED_SUBJECTS — up to 3 alternative phrasings of the subject. These give the user a quick pick list. If subject is null, leave this empty.`;

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
                'item', 'genre', 'cuisine', 'technique', 'style', 'material', 'color',
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
      urgency_date: { type: ['string', 'null'], description: 'ISO 8601 date (YYYY-MM-DD).' },
    },
    required: ['category', 'subject', 'typed_tags', 'suggested_subjects', 'urgency', 'urgency_date'],
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
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [TOOL as unknown as Anthropic.Messages.Tool],
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
    });

    const block = response.content.find(
      (b: Anthropic.Messages.ContentBlock) => b.type === 'tool_use',
    );
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
