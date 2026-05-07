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

const SYSTEM_PROMPT = `You analyze screenshots that someone saved for personal reference. Your job is to tag each screenshot with structured metadata so the user can later filter and retrieve it.

Always reply with a single tool call to \`analyze_screenshot\`. Never reply with prose.

Categories (pick exactly one, or null if none fit cleanly):
craft, fashion, film, tv, food, art, music, places, meme, messages, shopping, reading, events, tech, documents.

Subject: a specific 2-4 word phrase describing the actual thing — "Crochet beanie", "Italian pasta recipe", "React useEffect", "Brooklyn apartment". Use null if no clear subject.

Typed tags: choose 3-6 most relevant. Tag types are: item, genre, cuisine, technique, style, material, color, season, occasion, mood, source, person, place. Skip a type if it does not clearly apply. Each tag is {type, value} where value is a short noun phrase.

Urgency (only when there is a clear time signal in the image — date, deadline, "ends today", expiration):
today, expires_soon, this_week, this_month, this_season, this_year, someday. Use null if no time signal.

urgency_date: ISO date (YYYY-MM-DD) when an explicit date is visible, otherwise null.

Be conservative: better to omit a tag than to invent one. Better category=null than wrong category.`;

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
