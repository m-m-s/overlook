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
  // Reds / pinks
  'red', 'crimson', 'scarlet', 'vermilion', 'maroon', 'burgundy', 'wine',
  'cherry', 'brick', 'oxblood', 'pink', 'rose', 'blush', 'fuchsia', 'magenta',
  'salmon', 'coral', 'peach', 'apricot',
  // Oranges / yellows
  'orange', 'rust', 'terracotta', 'sienna', 'amber', 'ochre', 'mustard',
  'goldenrod', 'yellow', 'lemon', 'butter', 'ivory', 'cream', 'champagne',
  // Greens
  'green', 'lime', 'mint', 'sage', 'olive', 'forest', 'pine', 'kelly',
  'emerald', 'jade', 'seafoam', 'hunter', 'matcha', 'pistachio', 'moss',
  // Blues / cyans
  'blue', 'navy', 'royal', 'cobalt', 'sapphire', 'denim', 'indigo',
  'azure', 'sky', 'cornflower', 'periwinkle', 'powder blue', 'cerulean',
  'teal', 'aqua', 'cyan', 'turquoise',
  // Purples
  'purple', 'violet', 'lavender', 'lilac', 'plum', 'eggplant', 'aubergine',
  'mauve', 'orchid', 'amethyst',
  // Neutrals / browns
  'black', 'jet', 'onyx', 'charcoal', 'slate', 'graphite', 'pewter',
  'grey', 'gray', 'dove', 'silver', 'smoke', 'ash', 'stone', 'mushroom',
  'white', 'snow', 'oyster', 'pearl', 'bone',
  'brown', 'chocolate', 'espresso', 'mocha', 'coffee', 'walnut', 'mahogany',
  'tan', 'beige', 'taupe', 'khaki', 'camel', 'sand', 'fawn', 'putty',
  'caramel', 'honey', 'wheat',
  // Metallics
  'gold', 'rose gold', 'silver', 'bronze', 'copper', 'platinum',
  // Palettes / vibes
  'pastel', 'monochrome', 'earth tones', 'jewel tones', 'neon',
  'muted', 'saturated', 'warm tones', 'cool tones', 'neutrals',
  'vibrant', 'desaturated', 'tonal', 'colorblock', 'gradient', 'ombre',
]);

add('season', [
  'spring', 'summer', 'fall', 'autumn', 'winter',
  'early spring', 'late spring', 'early summer', 'late summer',
  'early fall', 'late fall', 'early winter', 'late winter',
  'holiday', 'holidays',
]);

add('cuisine', [
  // Major cuisines by region
  'italian', 'french', 'spanish', 'portuguese', 'greek', 'mediterranean',
  'german', 'austrian', 'swiss', 'belgian', 'dutch', 'british', 'irish',
  'scottish', 'scandinavian', 'swedish', 'danish', 'norwegian', 'finnish',
  'icelandic', 'polish', 'hungarian', 'czech', 'russian', 'ukrainian',
  'romanian', 'bulgarian',
  // Asian
  'japanese', 'korean', 'chinese', 'cantonese', 'sichuan', 'hunan', 'shanghai',
  'taiwanese', 'mongolian', 'tibetan', 'vietnamese', 'thai', 'lao', 'cambodian',
  'burmese', 'malaysian', 'indonesian', 'singaporean', 'filipino', 'indian',
  'south indian', 'north indian', 'punjabi', 'bengali', 'pakistani',
  'bangladeshi', 'sri lankan', 'nepalese',
  // Middle East / Africa
  'middle eastern', 'lebanese', 'syrian', 'turkish', 'persian', 'iranian',
  'israeli', 'palestinian', 'kurdish', 'yemeni', 'saudi', 'egyptian',
  'moroccan', 'tunisian', 'algerian', 'ethiopian', 'eritrean', 'somali',
  'nigerian', 'ghanaian', 'senegalese', 'south african',
  // Americas
  'mexican', 'tex-mex', 'cal-mex', 'cuban', 'puerto rican', 'dominican',
  'haitian', 'jamaican', 'trinidadian', 'caribbean', 'colombian', 'venezuelan',
  'peruvian', 'chilean', 'argentinian', 'uruguayan', 'brazilian', 'guatemalan',
  'salvadoran', 'honduran', 'panamanian',
  // North American regional
  'american', 'southern', 'soul food', 'cajun', 'creole', 'tex-mex',
  'midwestern', 'new england', 'pnw', 'pacific northwest', 'californian',
  'cal-italian', 'new mexican', 'hawaiian',
  // Diet / approach
  'fusion', 'pan-asian', 'plant-based', 'vegan', 'vegetarian', 'pescatarian',
  'gluten-free', 'paleo', 'keto', 'whole30', 'raw', 'macrobiotic',
  'farm-to-table', 'comfort food', 'street food', 'fast food', 'fine dining',
  'home cooking', 'family style',
]);

add('mood', [
  // Warmth / feel
  'cozy', 'warm', 'comforting', 'inviting', 'homey', 'hygge', 'lush',
  'soft', 'gentle', 'tender', 'romantic', 'dreamy', 'ethereal', 'magical',
  'whimsical', 'playful', 'cheerful', 'joyful', 'sunny', 'bright',
  // Serene / calm
  'serene', 'tranquil', 'peaceful', 'calm', 'chill', 'restful',
  'meditative', 'contemplative', 'introspective', 'quiet',
  // Bold / energetic
  'bold', 'vibrant', 'energetic', 'lively', 'dynamic', 'punchy',
  'electric', 'kinetic', 'intense',
  // Dark / moody
  'moody', 'dark', 'somber', 'melancholic', 'pensive', 'mysterious',
  'eerie', 'haunting', 'dramatic', 'gothic',
  // Refined / styled
  'elegant', 'sophisticated', 'refined', 'polished', 'luxurious', 'lavish',
  'opulent', 'plush', 'sleek', 'modern', 'minimal', 'minimalist',
  'maximalist', 'eclectic', 'curated',
  // Raw / natural
  'rustic', 'earthy', 'organic', 'natural', 'raw', 'rough-hewn',
  'lived-in', 'worn-in', 'patinaed', 'aged', 'weathered',
  'industrial', 'utilitarian', 'gritty', 'rugged', 'masculine',
  // Fresh / airy
  'airy', 'breezy', 'fresh', 'crisp', 'light', 'open', 'spacious',
  // Style-adjacent
  'classic', 'timeless', 'vintage', 'retro', 'nostalgic', 'futuristic',
  'avant-garde', 'experimental', 'quirky', 'kitsch', 'lo-fi', 'hi-fi',
]);

add('occasion', [
  // Vibe
  'casual', 'formal', 'semi-formal', 'business casual', 'smart casual',
  'cocktail', 'black tie', 'white tie', 'lounge', 'everyday',
  // Events / milestones
  'birthday', 'wedding', 'engagement', 'anniversary', 'baby shower',
  'bridal shower', 'graduation', 'retirement', 'housewarming', 'reunion',
  'memorial', 'funeral',
  // Parties / gatherings
  'party', 'cocktail party', 'dinner party', 'house party', 'launch party',
  'gala', 'ball', 'mixer', 'happy hour', 'tailgate',
  // Holidays
  'holiday', 'christmas', 'hanukkah', 'thanksgiving', 'easter',
  'lunar new year', 'diwali', 'ramadan', 'eid', 'halloween', 'valentines',
  'mothers day', 'fathers day', 'new years', 'fourth of july',
  // Daily contexts
  'work', 'office', 'wfh', 'meeting', 'interview', 'presentation',
  'date night', 'first date', 'girls night', 'guys night',
  'weekend', 'sunday', 'morning', 'evening',
  // Outings / travel
  'travel', 'flight', 'road trip', 'beach', 'pool', 'lake', 'cabin',
  'camping', 'glamping', 'hiking', 'skiing', 'snowboarding',
  'picnic', 'brunch', 'tea', 'gym', 'workout', 'yoga', 'pilates',
  'running', 'cycling',
]);

add('genre', [
  // Film / TV
  'horror', 'psychological horror', 'slasher', 'comedy', 'rom-com',
  'romantic comedy', 'sitcom', 'drama', 'melodrama', 'sci-fi',
  'science fiction', 'fantasy', 'high fantasy', 'urban fantasy',
  'thriller', 'psychological thriller', 'romance', 'documentary',
  'docuseries', 'docudrama', 'action', 'adventure', 'animation', 'anime',
  'cartoon', 'kdrama', 'telenovela', 'mystery', 'true crime', 'noir',
  'neo-noir', 'western', 'spaghetti western', 'period drama', 'historical',
  'crime', 'heist', 'biopic', 'musical', 'silent film', 'experimental',
  'short film', 'reality', 'game show', 'sketch comedy', 'standup',
  // Music — pop / rock
  'pop', 'indie pop', 'k-pop', 'j-pop', 'synth-pop', 'dream pop', 'art pop',
  'rock', 'classic rock', 'soft rock', 'hard rock', 'alt-rock', 'indie rock',
  'garage rock', 'punk', 'pop punk', 'post-punk', 'hardcore punk',
  'metal', 'heavy metal', 'death metal', 'black metal', 'doom', 'sludge',
  // Music — electronic
  'electronic', 'edm', 'house', 'deep house', 'tech house', 'progressive',
  'techno', 'minimal techno', 'trance', 'psytrance', 'dubstep', 'drum and bass',
  'jungle', 'breakbeat', 'idm', 'glitch', 'ambient', 'drone', 'downtempo',
  'trip-hop', 'lo-fi', 'vaporwave', 'chillwave', 'synthwave',
  // Music — soul / r&b / hip-hop
  'rap', 'hip-hop', 'boom bap', 'trap', 'drill', 'mumble rap', 'conscious rap',
  'r&b', 'neo-soul', 'soul', 'motown', 'funk', 'disco', 'go-go',
  // Music — jazz / classical / world
  'jazz', 'bebop', 'cool jazz', 'free jazz', 'fusion', 'smooth jazz',
  'classical', 'baroque', 'romantic', 'contemporary classical', 'opera',
  'choral', 'chamber music', 'film score', 'soundtrack',
  'folk', 'indie folk', 'americana', 'bluegrass', 'country', 'alt-country',
  'reggae', 'dub', 'dancehall', 'ska', 'reggaeton', 'afrobeat', 'afrobeats',
  'highlife', 'bossa nova', 'samba', 'salsa', 'merengue', 'cumbia',
  'tango', 'flamenco', 'fado',
  // Reading
  'literary fiction', 'historical fiction', 'romance novel', 'mystery novel',
  'thriller novel', 'fantasy novel', 'sci-fi novel', 'short story',
  'memoir', 'autobiography', 'biography', 'essay', 'criticism', 'reportage',
  'longform', 'self-help', 'self-improvement', 'cookbook', 'poetry',
  'history', 'philosophy', 'science writing', 'travel writing',
  'nature writing', 'food writing', 'graphic novel', 'comic',
  'manga', 'zine', 'newsletter', 'nonfiction',
]);

add('material', [
  // Natural fibers
  'wool', 'cashmere', 'merino', 'mohair', 'alpaca', 'angora', 'shearling',
  'cotton', 'organic cotton', 'pima cotton', 'supima', 'sea island cotton',
  'flannel', 'oxford cloth', 'poplin',
  'linen', 'irish linen', 'silk', 'mulberry silk', 'tussah silk', 'satin',
  'charmeuse', 'velvet', 'velour', 'corduroy', 'flannel', 'tweed',
  'denim', 'selvedge denim', 'raw denim', 'chambray', 'canvas', 'duck cloth',
  // Animal
  'leather', 'full-grain leather', 'top-grain', 'suede', 'nubuck',
  'patent leather', 'shearling', 'fur', 'faux fur', 'pony hair',
  // Synthetics / blends
  'polyester', 'nylon', 'rayon', 'viscose', 'modal', 'lyocell', 'tencel',
  'spandex', 'elastane', 'fleece', 'felt', 'jersey', 'knit', 'rib knit',
  'mesh', 'lace', 'tulle', 'chiffon', 'organza', 'taffeta',
  'gore-tex', 'recycled polyester', 'hemp', 'jute', 'raffia', 'sisal',
  // Patterns (treated as materials in user vocabulary)
  'twill', 'herringbone', 'houndstooth', 'plaid', 'tartan', 'gingham',
  'polka dot', 'pinstripe', 'paisley', 'ikat', 'batik', 'jacquard', 'brocade',
  // Wood
  'wood', 'oak', 'white oak', 'red oak', 'walnut', 'maple', 'cherry',
  'mahogany', 'teak', 'pine', 'cedar', 'birch', 'beech', 'rosewood', 'ash',
  'plywood', 'reclaimed wood', 'butcher block',
  'bamboo', 'rattan', 'wicker', 'cane', 'cork',
  // Stone / hard
  'marble', 'carrara', 'calacatta', 'granite', 'travertine', 'limestone',
  'soapstone', 'quartz', 'quartzite', 'slate', 'sandstone', 'basalt',
  'concrete', 'terrazzo', 'plaster', 'lime wash', 'venetian plaster',
  // Ceramic / glass
  'ceramic', 'porcelain', 'stoneware', 'earthenware', 'terracotta', 'raku',
  'glaze', 'glass', 'frosted glass', 'smoked glass', 'crystal', 'enamel',
  // Metals
  'metal', 'brass', 'aged brass', 'unlacquered brass', 'bronze', 'copper',
  'steel', 'stainless steel', 'cor-ten', 'carbon steel', 'cast iron',
  'iron', 'wrought iron', 'aluminum', 'pewter', 'silver', 'gold-plated',
  'rose gold', 'matte black metal',
  // Other
  'paper', 'handmade paper', 'cardboard', 'leather paper', 'plastic',
  'acrylic', 'lucite', 'resin', 'rubber', 'silicone',
]);

add('technique', [
  // Fiber crafts
  'crochet', 'knitting', 'cable stitch', 'fair isle', 'colorwork', 'intarsia',
  'lace knitting', 'brioche', 'mosaic knitting', 'finger knitting',
  'embroidery', 'sashiko', 'crewel', 'cross stitch', 'needlepoint',
  'weaving', 'tapestry weaving', 'macrame', 'quilting', 'patchwork',
  'applique', 'sewing', 'hand sewing', 'tatting', 'rug hooking',
  'punch needle', 'felting', 'wet felting', 'needle felting', 'beading',
  'tufting', 'tie-dye', 'shibori', 'natural dyeing',
  // Print / paper
  'screenprint', 'screen printing', 'block printing', 'linocut', 'woodcut',
  'mokuhanga', 'lithography', 'monoprint', 'risograph', 'letterpress',
  'collage', 'decoupage', 'papercraft', 'origami', 'kirigami', 'bookbinding',
  'marbling', 'paper marbling',
  // Drawing / painting
  'watercolor', 'gouache', 'oil paint', 'oil painting', 'acrylic painting',
  'ink', 'sumi-e', 'india ink', 'charcoal', 'pastel', 'oil pastel',
  'colored pencil', 'graphite', 'pen and ink', 'mixed media', 'lettering',
  'hand lettering', 'calligraphy', 'modern calligraphy', 'brush calligraphy',
  // Ceramics / pottery
  'pottery', 'wheel throwing', 'hand-building', 'slab building', 'coil pot',
  'pinch pot', 'ceramic glazing', 'raku', 'kintsugi', 'sgraffito',
  'wood firing',
  // Cooking — heat
  'baking', 'roasting', 'broiling', 'grilling', 'smoking', 'bbq',
  'sous vide', 'searing', 'sauteing', 'stir-frying', 'frying', 'deep frying',
  'pan frying', 'shallow frying', 'poaching', 'simmering', 'boiling',
  'steaming', 'blanching', 'reducing', 'deglazing', 'braising', 'stewing',
  'pressure cooking', 'slow cooking',
  // Cooking — prep / preserving
  'sourdough', 'baking bread', 'laminating dough', 'proofing', 'fermenting',
  'pickling', 'curing', 'brining', 'canning', 'preserving', 'jam making',
  'dehydrating', 'smoking meat',
  // Cooking — pastry / sweet
  'tempering chocolate', 'whipping', 'folding', 'creaming', 'kneading',
  'caramelizing', 'candying', 'meringue', 'pate a choux', 'choux pastry',
  'puff pastry', 'shortcrust', 'pie crust',
]);

add('item', [
  // Recipes / instructions
  'recipe', 'pattern', 'tutorial', 'guide', 'how-to', 'instructions',
  'video', 'tutorial video', 'lesson', 'masterclass', 'workshop',
  'reference', 'tip', 'hack', 'cheat sheet', 'mood board',
  // Apparel — tops
  'shirt', 't-shirt', 'tee', 'tank', 'tank top', 'camisole', 'blouse',
  'tunic', 'henley', 'polo', 'button-down', 'button-up', 'oxford',
  'sweater', 'cardigan', 'pullover', 'turtleneck', 'mock neck', 'crewneck',
  'sweatshirt', 'hoodie', 'jumper', 'vest', 'waistcoat',
  // Apparel — bottoms
  'pants', 'jeans', 'trousers', 'slacks', 'chinos', 'shorts', 'cargo shorts',
  'culottes', 'leggings', 'tights', 'joggers', 'sweats', 'skirt',
  'midi skirt', 'maxi skirt', 'mini skirt', 'pencil skirt',
  // Apparel — dresses / outerwear
  'dress', 'midi dress', 'maxi dress', 'mini dress', 'sundress',
  'jumpsuit', 'romper', 'overall',
  'jacket', 'denim jacket', 'leather jacket', 'bomber', 'puffer',
  'puffer jacket', 'parka', 'anorak', 'windbreaker', 'rain jacket',
  'coat', 'trench coat', 'overcoat', 'peacoat',
  'blazer', 'suit', 'tuxedo', 'overshirt', 'shacket',
  // Apparel — accessories / footwear / undies / sleep
  'hat', 'beanie', 'cap', 'baseball cap', 'beret', 'fedora', 'sun hat',
  'visor', 'headband', 'scarf', 'shawl', 'wrap', 'cape',
  'gloves', 'mittens', 'shoe', 'shoes', 'sneaker', 'sneakers', 'trainer',
  'running shoes', 'boot', 'boots', 'ankle boot', 'chelsea boot',
  'combat boot', 'cowboy boot', 'heel', 'heels', 'pump', 'flat', 'flats',
  'loafer', 'loafers', 'oxfords', 'mule', 'mules', 'sandal', 'sandals',
  'flip-flop', 'flip-flops', 'slippers',
  'belt', 'tie', 'bow tie', 'suspenders', 'cufflinks', 'pocket square',
  'sunglasses', 'glasses', 'watch', 'bracelet', 'cuff', 'necklace',
  'choker', 'pendant', 'ring', 'earrings', 'studs', 'hoops', 'brooch',
  'pin', 'hair clip',
  'pajamas', 'robe', 'kimono', 'kaftan', 'nightgown',
  'underwear', 'bra', 'briefs', 'boxers', 'socks',
  'swimsuit', 'bikini', 'one-piece', 'trunks', 'rashguard',
  // Bags
  'bag', 'tote', 'backpack', 'purse', 'handbag', 'satchel', 'briefcase',
  'duffel', 'duffel bag', 'luggage', 'suitcase', 'carry-on', 'fanny pack',
  'belt bag', 'crossbody', 'shoulder bag', 'clutch', 'messenger bag',
  'weekender', 'gym bag', 'wallet', 'cardholder', 'pouch',
  // Furniture
  'chair', 'armchair', 'accent chair', 'lounge chair', 'rocking chair',
  'dining chair', 'office chair', 'stool', 'bar stool', 'bench', 'ottoman',
  'pouf', 'sofa', 'couch', 'sectional', 'loveseat', 'daybed', 'chaise',
  'bed', 'bedframe', 'headboard', 'nightstand', 'side table', 'end table',
  'coffee table', 'console table', 'console', 'sideboard', 'buffet',
  'dining table', 'kitchen table', 'desk', 'writing desk', 'standing desk',
  'dresser', 'chest of drawers', 'wardrobe', 'armoire', 'vanity',
  'bookshelf', 'bookcase', 'shelving', 'open shelving', 'shelf',
  'china cabinet', 'hutch', 'bar cart',
  // Lighting / decor
  'lamp', 'table lamp', 'floor lamp', 'desk lamp', 'pendant lamp',
  'chandelier', 'sconce', 'wall sconce', 'flush mount', 'track light',
  'mirror', 'wall mirror', 'floor mirror', 'rug', 'area rug', 'runner',
  'doormat', 'hide rug', 'kilim',
  'pillow', 'throw pillow', 'cushion', 'bolster', 'throw', 'blanket',
  'duvet', 'comforter', 'quilt', 'sheet set',
  'curtain', 'drapes', 'blinds', 'shades', 'roman shade',
  'wall art', 'poster', 'print', 'painting', 'photograph', 'photo',
  'sculpture', 'figurine', 'statue', 'bust', 'mobile',
  'vase', 'vessel', 'urn', 'planter', 'pot', 'plant', 'houseplant',
  'tray', 'platter', 'jar', 'canister', 'candle', 'taper', 'candleholder',
  'incense', 'diffuser',
  'picture frame', 'clock', 'wall clock', 'mantle clock',
  'doorknob', 'cabinet pull', 'hardware',
  // Kitchenware
  'pan', 'frying pan', 'skillet', 'cast iron pan', 'wok',
  'pot', 'stockpot', 'saucepan', 'sauce pot', 'dutch oven', 'pressure cooker',
  'instant pot', 'slow cooker', 'rice cooker',
  'baking sheet', 'sheet pan', 'baking dish', 'casserole', 'ramekin',
  'pie dish', 'cake pan', 'loaf pan', 'muffin tin', 'tart pan',
  'mixing bowl', 'bowl', 'colander', 'sieve', 'strainer', 'cutting board',
  'knife', 'paring knife', 'chef knife', 'bread knife', 'serrated knife',
  'peeler', 'grater', 'microplane', 'whisk', 'spatula', 'turner', 'tongs',
  'ladle', 'masher', 'rolling pin', 'mortar', 'pestle', 'kitchen scale',
  'thermometer', 'measuring cup', 'measuring spoon',
  'blender', 'immersion blender', 'food processor', 'mixer', 'stand mixer',
  'hand mixer', 'toaster', 'toaster oven', 'air fryer', 'kettle',
  'coffee maker', 'espresso machine', 'french press', 'aeropress',
  'pour-over', 'tea pot', 'teakettle',
  'plate', 'salad plate', 'dinner plate', 'side plate', 'cup', 'mug',
  'teacup', 'wine glass', 'glass', 'tumbler', 'pitcher', 'carafe',
  'decanter', 'fork', 'spoon', 'butter knife', 'chopsticks', 'napkin',
  'placemat', 'table runner', 'tablecloth', 'coaster', 'trivet', 'apron',
  // Tech
  'phone', 'iphone', 'android', 'laptop', 'macbook', 'tablet', 'ipad',
  'monitor', 'display', 'keyboard', 'mouse', 'trackpad', 'headphones',
  'over-ear headphones', 'in-ear headphones', 'earbuds', 'speakers',
  'bluetooth speaker', 'soundbar', 'camera', 'dslr', 'mirrorless camera',
  'lens', 'tripod', 'gimbal', 'microphone', 'mic',
  'charger', 'cable', 'power strip', 'dock', 'stand', 'mount',
  'router', 'hub', 'smart home', 'smart light', 'smart bulb',
  // Books / media
  'book', 'novel', 'cookbook', 'memoir', 'poetry collection', 'essay collection',
  'self-help book', 'reference book', 'manual', 'guide book',
  'magazine', 'journal', 'notebook', 'planner', 'newspaper', 'comic',
  'graphic novel', 'manga', 'zine',
  'article', 'essay', 'newsletter', 'podcast', 'episode',
  'movie', 'film', 'show', 'series', 'season',
  'song', 'album', 'ep', 'single', 'playlist', 'mixtape',
  'vinyl', 'record', 'cd', 'cassette',
  // Spaces / outings
  'restaurant', 'cafe', 'coffee shop', 'coffeehouse', 'tea house',
  'bar', 'wine bar', 'cocktail bar', 'dive bar', 'speakeasy',
  'brewery', 'distillery', 'winery', 'pub', 'tavern',
  'bakery', 'patisserie', 'deli', 'butcher', 'cheese shop',
  'apartment', 'house', 'home', 'studio', 'cabin', 'cottage', 'loft',
  'bungalow', 'townhouse', 'condo', 'penthouse', 'a-frame',
  'hotel', 'airbnb', 'inn', 'b&b', 'hostel', 'resort',
  'museum', 'gallery', 'shop', 'store', 'boutique', 'thrift store',
  'vintage shop', 'flea market', 'farmers market', 'market', 'mall',
  'department store', 'bookstore', 'library', 'theater', 'concert hall',
  'venue', 'club', 'lounge', 'gym', 'studio gym', 'spa', 'salon',
  'park', 'garden', 'botanic garden', 'arboretum', 'trail', 'beach',
  'cove', 'lake', 'pond', 'mountain', 'overlook', 'vista', 'lookout',
  // Skincare / beauty
  'cleanser', 'face wash', 'moisturizer', 'serum', 'oil', 'face oil',
  'sunscreen', 'spf', 'mask', 'sheet mask', 'face mask', 'exfoliator',
  'scrub', 'toner', 'mist', 'eye cream', 'lip balm', 'lip mask',
  'primer', 'foundation', 'concealer', 'powder', 'blush', 'bronzer',
  'highlighter', 'contour', 'eyeshadow', 'eyeliner', 'mascara',
  'lipstick', 'lip gloss', 'lip stain', 'lip oil',
  'makeup brush', 'beauty sponge', 'hair brush', 'comb',
  'hair dryer', 'curling iron', 'flat iron', 'straightener',
  'shampoo', 'conditioner', 'hair mask', 'hair oil', 'leave-in',
  'perfume', 'cologne', 'fragrance', 'body spray', 'body lotion',
  'body wash', 'soap', 'bar soap',
  // Outdoor / sport
  'tent', 'sleeping bag', 'cooler', 'hammock', 'ski', 'snowboard',
  'bike', 'bicycle', 'mountain bike', 'road bike', 'helmet', 'pannier',
  'yoga mat', 'foam roller', 'kettlebell', 'dumbbell', 'resistance band',
  // Misc
  'gift', 'present', 'meme', 'screenshot', 'inspiration', 'reference',
]);

add('style', [
  // Decor / interior
  'traditional', 'transitional', 'contemporary', 'modern', 'modernist',
  'postmodern', 'mid-century', 'mid century modern', 'mcm',
  'scandi', 'scandinavian', 'nordic', 'hygge', 'lagom', 'japandi',
  'japanese', 'wabi-sabi',
  'art deco', 'art nouveau', 'bauhaus', 'memphis', 'shaker',
  'victorian', 'georgian', 'colonial', 'neo-classical', 'baroque',
  'rococo', 'gothic',
  'farmhouse', 'modern farmhouse', 'cottagecore', 'country',
  'french country', 'french provincial',
  'industrial', 'urban industrial', 'loft',
  'minimalist', 'maximalist', 'eclectic', 'bohemian', 'boho',
  'shabby chic', 'vintage', 'antique', 'retro',
  '50s', '60s', '70s', '80s', '90s', 'y2k',
  'mediterranean', 'tuscan', 'spanish revival', 'moroccan',
  'coastal', 'beach', 'nautical', 'tropical', 'desert',
  'southwestern', 'rustic', 'western', 'lodge', 'mountain',
  'organic modern', 'biophilic', 'soft modern',
  'dark academia', 'light academia', 'library aesthetic',
  'fairycore', 'goblincore', 'mushroomcore', 'witchcore',
  // Fashion
  'classic', 'preppy', 'ivy', 'old money', 'quiet luxury',
  'streetwear', 'workwear', 'utility', 'gorpcore',
  'normcore', 'basic', 'minimal', 'maximalist',
  'avant-garde', 'experimental', 'deconstructed',
  'punk', 'pop punk', 'goth', 'gothic', 'emo', 'scene', 'grunge', 'mod',
  'rocker', 'biker',
  'boho', 'bohemian', 'hippie', 'gypsy',
  'romantic', 'cottagecore', 'coquette', 'balletcore', 'soft girl',
  'twee', 'indie sleaze', 'e-girl', 'vsco', 'tomboy',
  'androgynous', 'gender-neutral', 'masculine', 'feminine',
  'athleisure', 'activewear', 'dance', 'beachy',
  'mermaidcore', 'regencycore', 'cluttercore', 'blokette',
  // Architecture-adjacent
  'brutalism', 'brutalist', 'modernism', 'postmodernism',
  'deconstructivism', 'futurism', 'parametric',
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
