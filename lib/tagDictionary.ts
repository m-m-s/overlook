import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TypedTag } from './screenshots';

/**
 * Tag-type auto-detection per CLAUDE.md tagging system.
 *
 * Lookup order on a value:
 *   1. Exact match in learned dictionary  (user's past type assignments)
 *   2. Exact match in built-in dictionary (this file)
 *   3. Plural-stripped match (drop trailing 's' / 'es') in either dict
 *   4. Token match — split on whitespace, check each token; if a single
 *      token has a single-type match, use that.
 * If found in exactly one type → auto-type.
 * If found in multiple types   → caller prompts user with the candidates.
 * Otherwise                    → leave untyped.
 *
 * When the user manually assigns a type, save it to the learned dictionary so
 * future entries with the same value auto-type.
 */

// ----- Built-in dictionary --------------------------------------------------

/**
 * Map of normalized value -> list of plausible types. Multi-type entries are
 * deliberately conservative; the goal is to *help* without being annoying.
 */
const BUILT_IN: Record<string, string[]> = {};

const add = (type: string, values: string[]) => {
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key) continue;
    if (!BUILT_IN[key]) BUILT_IN[key] = [];
    if (!BUILT_IN[key].includes(type)) BUILT_IN[key].push(type);
  }
};

add('color', [
  // Basics
  'red', 'orange', 'yellow', 'green', 'blue', 'navy', 'teal', 'aqua', 'cyan',
  'purple', 'lavender', 'lilac', 'violet', 'indigo', 'magenta',
  'pink', 'rose', 'fuchsia', 'coral', 'salmon', 'peach',
  'black', 'white', 'grey', 'gray', 'silver', 'charcoal',
  'brown', 'tan', 'beige', 'cream', 'ivory', 'taupe', 'khaki', 'camel',
  'gold', 'bronze', 'copper', 'rust', 'maroon', 'burgundy', 'crimson',
  'olive', 'sage', 'forest', 'mint', 'emerald', 'jade',
  // Palettes / vibes
  'pastel', 'monochrome', 'earth tones', 'jewel tones', 'neon',
  'muted', 'saturated', 'warm tones', 'cool tones', 'neutrals',
]);

add('season', [
  'spring', 'summer', 'fall', 'autumn', 'winter',
  'early spring', 'late spring', 'early summer', 'late summer',
  'early fall', 'late fall', 'early winter', 'late winter',
  'holiday', 'holidays',
]);

add('cuisine', [
  'italian', 'japanese', 'mexican', 'chinese', 'thai', 'indian', 'french',
  'korean', 'vietnamese', 'american', 'mediterranean', 'middle eastern',
  'ethiopian', 'brazilian', 'spanish', 'greek', 'turkish', 'lebanese',
  'moroccan', 'peruvian', 'caribbean', 'cajun', 'german', 'british', 'irish',
  'cuban', 'argentinian', 'filipino', 'malaysian', 'indonesian', 'taiwanese',
  'sichuan', 'cantonese', 'tex-mex', 'soul food', 'pan-asian', 'fusion',
  'southern', 'midwestern', 'new england', 'pnw', 'cal-italian',
]);

add('mood', [
  'cozy', 'bold', 'moody', 'bright', 'minimal', 'minimalist', 'maximalist',
  'playful', 'serene', 'calm', 'chill', 'dramatic', 'soft', 'edgy', 'sleek',
  'romantic', 'rustic', 'industrial', 'modern', 'vintage', 'classic',
  'retro', 'futuristic', 'whimsical', 'elegant', 'sophisticated', 'quirky',
  'earthy', 'airy', 'dark', 'light', 'bold', 'neutral', 'lush',
  'lo-fi', 'hi-fi', 'gritty', 'polished', 'lived-in',
]);

add('occasion', [
  'casual', 'formal', 'date night', 'birthday', 'wedding', 'engagement',
  'anniversary', 'shower', 'graduation', 'party', 'cocktail party',
  'dinner party', 'holiday', 'christmas', 'thanksgiving', 'easter',
  'halloween', 'valentines', 'new years', 'work', 'office', 'weekend',
  'travel', 'beach', 'brunch', 'picnic', 'everyday', 'lounge', 'workout',
]);

add('genre', [
  // Film/TV
  'horror', 'comedy', 'drama', 'sci-fi', 'science fiction', 'fantasy',
  'thriller', 'romance', 'rom-com', 'documentary', 'docuseries', 'action',
  'adventure', 'animation', 'anime', 'mystery', 'true crime', 'noir',
  'western', 'period drama', 'crime', 'biopic', 'musical',
  // Music
  'lo-fi', 'indie', 'pop', 'rock', 'jazz', 'classical', 'electronic', 'edm',
  'ambient', 'folk', 'rap', 'hip-hop', 'r&b', 'soul', 'funk', 'punk',
  'metal', 'country', 'reggae', 'house', 'techno', 'disco', 'bossa nova',
  // Reading
  'literary fiction', 'memoir', 'essay', 'self-help', 'cookbook', 'poetry',
  'history', 'nonfiction',
]);

add('material', [
  'wool', 'cashmere', 'merino', 'cotton', 'linen', 'silk', 'satin', 'velvet',
  'corduroy', 'denim', 'leather', 'suede', 'nubuck', 'shearling', 'fur',
  'fleece', 'felt', 'jersey', 'knit', 'mesh', 'lace', 'tulle', 'chiffon',
  'wood', 'oak', 'walnut', 'bamboo', 'rattan', 'wicker', 'cane',
  'ceramic', 'porcelain', 'stoneware', 'terracotta', 'glass', 'crystal',
  'metal', 'brass', 'steel', 'iron', 'aluminum', 'copper', 'gold-plated',
  'concrete', 'plaster', 'marble', 'granite', 'travertine', 'soapstone',
  'paper', 'cardboard', 'plastic', 'acrylic', 'resin', 'rubber',
]);

add('technique', [
  // Craft
  'cable stitch', 'crochet', 'knitting', 'embroidery', 'cross stitch',
  'weaving', 'macrame', 'quilting', 'sewing', 'tatting', 'rug hooking',
  'felting', 'beading', 'punch needle',
  // Art
  'watercolor', 'oil paint', 'oil painting', 'acrylic painting', 'gouache',
  'ink', 'charcoal', 'pastel', 'collage', 'screenprint', 'linocut',
  'lithography', 'etching', 'lettering', 'calligraphy',
  // Cooking
  'sourdough', 'fermenting', 'pickling', 'roasting', 'braising', 'grilling',
  'smoking', 'sous vide', 'baking', 'sauteing', 'searing', 'poaching',
  'confit', 'curing', 'canning', 'preserving',
]);

add('item', [
  // Recipes / instructions
  'recipe', 'pattern', 'tutorial', 'guide', 'how-to', 'instructions',
  'video', 'tutorial video',
  // Apparel
  'dress', 'sweater', 'cardigan', 'shirt', 't-shirt', 'tank', 'blouse',
  'pants', 'jeans', 'trousers', 'shorts', 'skirt', 'jumpsuit', 'romper',
  'jacket', 'coat', 'parka', 'blazer', 'suit', 'vest', 'overshirt',
  'hat', 'beanie', 'cap', 'scarf', 'gloves', 'shoes', 'sneakers', 'boots',
  'heels', 'flats', 'sandals', 'bag', 'tote', 'backpack', 'purse', 'wallet',
  // Home / decor
  'lamp', 'rug', 'pillow', 'throw', 'curtain', 'mirror', 'shelf', 'chair',
  'sofa', 'couch', 'bed', 'desk', 'table', 'dresser', 'side table',
  'wall art', 'poster', 'painting', 'sculpture', 'vase', 'bowl', 'mug',
  'plate', 'utensil', 'gadget', 'tool',
  // Reading / media
  'book', 'novel', 'article', 'essay', 'newsletter', 'podcast', 'episode',
  'movie', 'film', 'show', 'series', 'song', 'album', 'playlist', 'mixtape',
  // Spaces / outings
  'restaurant', 'cafe', 'coffee shop', 'bar', 'wine bar', 'apartment',
  'house', 'studio', 'hotel', 'airbnb', 'museum', 'gallery', 'shop',
  'boutique', 'market',
  // Misc
  'gift', 'present', 'recipe card', 'meme', 'screenshot',
]);

add('style', [
  // Decor / aesthetic styles (small set — style is too varied to enumerate)
  'mid-century', 'mid century modern', 'scandi', 'scandinavian', 'japandi',
  'bauhaus', 'art deco', 'art nouveau', 'cottagecore', 'farmhouse',
  'french country', 'mediterranean', 'maximalist', 'minimalist',
  'industrial', 'modernist', 'postmodern', 'wabi-sabi', 'shaker',
  // Fashion
  'streetwear', 'workwear', 'preppy', 'gorpcore', 'normcore', 'avant-garde',
  'y2k', 'old money', 'quiet luxury', 'punk', 'goth', 'grunge', 'mod',
  'boho', 'bohemian', 'cottagecore',
]);

// ----- Tokenizers / normalizers ---------------------------------------------

const SUFFIXES_TO_STRIP: [string, string][] = [
  ['ies', 'y'],   // berries -> berry
  ['es', ''],     // dishes -> dish
  ['s', ''],      // dresses -> dresse, dress (we'll try 'es' first)
];

const stripPlural = (k: string): string | null => {
  for (const [suf, repl] of SUFFIXES_TO_STRIP) {
    if (k.endsWith(suf) && k.length - suf.length >= 3) {
      return k.slice(0, k.length - suf.length) + repl;
    }
  }
  return null;
};

// ----- Learned dictionary ---------------------------------------------------

const LEARNED_KEY = 'overlook.learned_tag_types';

let cache: Record<string, string> | null = null;

const loadLearned = async (): Promise<Record<string, string>> => {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(LEARNED_KEY);
    cache = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    cache = {};
  }
  return cache;
};

const saveLearned = async (next: Record<string, string>): Promise<void> => {
  cache = next;
  try {
    await AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(next));
  } catch {
    // best effort
  }
};

/**
 * Record that `value` was assigned `type`. Future lookups will auto-type.
 */
export const rememberTagType = async (value: string, type: string): Promise<void> => {
  const key = value.trim().toLowerCase();
  if (!key) return;
  const learned = await loadLearned();
  if (learned[key] === type) return;
  await saveLearned({ ...learned, [key]: type });
};

// ----- Lookup ---------------------------------------------------------------

export type LookupResult =
  | { kind: 'unknown' }
  | { kind: 'auto'; type: string }
  | { kind: 'ambiguous'; candidates: string[] };

const lookupSingle = (key: string, learned: Record<string, string>): string[] | null => {
  const learnedHit = learned[key];
  if (learnedHit) return [learnedHit];
  const builtIn = BUILT_IN[key];
  if (builtIn && builtIn.length > 0) return builtIn;
  return null;
};

/**
 * Look up the type(s) for a tag value. Tries: exact -> plural-stripped ->
 * tokens. Stops at first hit. Learned dict beats built-in.
 */
export const lookupTagType = async (value: string): Promise<LookupResult> => {
  const key = value.trim().toLowerCase();
  if (!key) return { kind: 'unknown' };
  const learned = await loadLearned();

  // 1. Exact match
  const exact = lookupSingle(key, learned);
  if (exact) {
    return exact.length === 1 ? { kind: 'auto', type: exact[0] } : { kind: 'ambiguous', candidates: exact };
  }

  // 2. Plural-stripped exact
  const sing = stripPlural(key);
  if (sing) {
    const stripped = lookupSingle(sing, learned);
    if (stripped) {
      return stripped.length === 1
        ? { kind: 'auto', type: stripped[0] }
        : { kind: 'ambiguous', candidates: stripped };
    }
  }

  // 3. Token match — only commit if exactly one token has a single-type hit
  const tokens = key.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length > 1) {
    const tokenHits: { token: string; types: string[] }[] = [];
    for (const tok of tokens) {
      const hit = lookupSingle(tok, learned) ?? (stripPlural(tok) ? lookupSingle(stripPlural(tok)!, learned) : null);
      if (hit) tokenHits.push({ token: tok, types: hit });
    }
    if (tokenHits.length === 1 && tokenHits[0].types.length === 1) {
      return { kind: 'auto', type: tokenHits[0].types[0] };
    }
    // Multiple tokens hitting different types → don't guess. Leave untyped.
  }

  return { kind: 'unknown' };
};

/**
 * Wrap a string in a TypedTag. If the value is in the dictionary, the type is
 * auto-assigned. Caller should still handle the ambiguous case in UI.
 */
export const buildTagFromValue = async (
  value: string,
): Promise<TypedTag | { ambiguous: true; value: string; candidates: string[] }> => {
  const r = await lookupTagType(value);
  if (r.kind === 'auto') return { type: r.type, value };
  if (r.kind === 'ambiguous') return { ambiguous: true, value, candidates: r.candidates };
  return { value };
};
