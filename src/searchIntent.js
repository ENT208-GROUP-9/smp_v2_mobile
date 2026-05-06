const EVENT_TYPE_IDS = ['academic', 'forum', 'careers', 'exhibition', 'student-life', 'festival', 'sports', 'exam', 'deadline'];
const STUDENT_LENS_IDS = ['all', 'campus', 'ime', 'ai-computing', 'fintech-industry', 'robotics', 'iot', 'cultural-technology', 'chips'];
const LEGACY_LENS_MAP = {
  'ai-education': 'ai-computing',
  engineering: 'ime',
  business: 'fintech-industry',
  research: 'campus',
  'campus-life': 'campus',
  schoolwide: 'campus',
  'school-wide': 'campus',
};
const TIME_FILTER_IDS = ['all', 'today', 'upcoming', 'week', 'now', 'laterToday', 'tomorrow'];

export const SEARCH_INTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    confidence: { type: 'number' },
    timeFilter: { type: 'string', enum: TIME_FILTER_IDS },
    typeIds: { type: 'array', items: { type: 'string', enum: EVENT_TYPE_IDS } },
    lensIds: { type: 'array', items: { type: 'string', enum: STUDENT_LENS_IDS } },
    buildingIds: { type: 'array', items: { type: 'string' } },
    locationHints: { type: 'array', items: { type: 'string' } },
    floor: { type: 'string' },
    room: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    explanationZh: { type: 'string' },
    explanationEn: { type: 'string' },
  },
  required: [
    'confidence',
    'timeFilter',
    'typeIds',
    'lensIds',
    'buildingIds',
    'locationHints',
    'floor',
    'room',
    'keywords',
    'explanationZh',
    'explanationEn',
  ],
};

const TYPE_ALIASES = [
  { ids: ['sports'], terms: ['sport', 'sports', 'basketball', 'football', 'soccer', 'badminton', 'tennis', 'fitness', '\u4f53\u80b2', '\u8fd0\u52a8', '\u7bee\u7403', '\u8db3\u7403', '\u7fbd\u6bdb\u7403'] },
  { ids: ['exam'], terms: ['exam', 'quiz', 'test', 'midterm', 'final', '\u8003\u8bd5', '\u6d4b\u9a8c', '\u671f\u4e2d', '\u671f\u672b'] },
  { ids: ['deadline'], terms: ['deadline', 'due', 'submit', 'submission', '\u622a\u6b62', '\u622a\u6b62\u65e5\u671f', '\u63d0\u4ea4', '\u5230\u671f'] },
  { ids: ['academic', 'forum'], terms: ['lecture', 'talk', '讲座'] },
  { ids: ['academic'], terms: ['academic', 'seminar', 'workshop', 'class', 'study', 'course', '学术', '课程', '作业'] },
  { ids: ['forum'], terms: ['forum', 'conference', 'symposium', 'panel', '论坛', '会议', '圆桌'] },
  { ids: ['careers'], terms: ['career', 'careers', 'job', 'internship', 'industry', 'recruit', '就业', '招聘', '实习', '行业'] },
  { ids: ['exhibition'], terms: ['exhibition', 'showcase', 'display', '展览', '展示'] },
  { ids: ['student-life'], terms: ['student life', 'club', 'salon', 'tedx', 'social', '学生', '社团', '沙龙', '生活'] },
  { ids: ['festival'], terms: ['festival', 'bazaar', 'fair', 'coffee', '市集', '节日', '嘉年华', '咖啡'] },
];

const LENS_ALIASES = [
  { ids: ['all'], terms: ['collection', 'all', 'all events', '\u96c6\u5408', '\u5168\u90e8'] },
  { ids: ['campus'], terms: ['campus', 'school-wide', 'all school', 'campus level', 'campus-wide', '\u6821\u56ed', '\u6821\u7ea7', '\u5168\u6821'] },
  { ids: ['all'], terms: ['school-wide', 'all school', 'campus level', 'campus-wide', '全校', '校级'] },
  { ids: ['ai-computing'], terms: ['ai', 'artificial intelligence', 'advanced computing', 'aied', 'education', 'teaching', 'learning', '人工智能', '先进计算'] },
  { ids: ['ime'], terms: ['ime', 'manufacturing', 'intelligent manufacturing', 'ecosystem', '智造生态', '智能制造'] },
  { ids: ['fintech-industry'], terms: ['finance', 'fintech', 'industry integration', 'business', 'entrepreneur', 'startup', '产金融合', '金融'] },
  { ids: ['robotics'], terms: ['robot', 'robotics', '机器人'] },
  { ids: ['iot'], terms: ['iot', 'internet of things', '物联网'] },
  { ids: ['cultural-technology'], terms: ['culture', 'cultural technology', 'media', 'design', 'salon', '文化科技', '文化', '传媒', '设计'] },
  { ids: ['chips'], terms: ['chip', 'chips', 'semiconductor', '芯片', '半导体'] },
];

const TIME_ALIASES = [
  { id: 'today', terms: ['today', 'now', 'right now', 'current', 'currently', '今天', '正在', '现在'] },
  { id: 'upcoming', terms: ['upcoming', 'next', 'later', 'future', '即将', '稍后', '接下来'] },
  { id: 'week', terms: ['this week', 'next 7 days', 'week', '未来7天', '本周'] },
];

const BUILDING_ALIASES = [
  { id: 'XEC', terms: ['xec', 'xec campus', 'xec map', 'xec校区'] },
  { id: 'AB', terms: ['ab', 'a-b', 'ab building', 'a b building', 'ab楼'] },
  { id: 'B-C', terms: ['bc', 'b-c', 'bc building', 'b c corridor', 'bc楼'] },
  { id: 'A', terms: ['a building', 'a楼'] },
  { id: 'B', terms: ['b building', 'b楼'] },
  { id: 'C', terms: ['c building', 'c楼'] },
  { id: 'J', terms: ['j building', 'j楼', 'students centre', 'student centre'] },
  { id: 'M', terms: ['m building', 'm楼'] },
];

const FLOOR_ALIASES = [
  { id: '1F', terms: ['1f', '1 floor', 'first floor', '一楼', '一层', '1楼', 'yilou'] },
  { id: '2F', terms: ['2f', '2 floor', 'second floor', '二楼', '二层', '2楼', 'erlou'] },
  { id: '3F', terms: ['3f', '3 floor', 'third floor', '三楼', '三层', '3楼', 'sanlou'] },
  { id: '4F', terms: ['4f', '4 floor', 'fourth floor', '四楼', '四层', '4楼', 'silou'] },
];

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'at',
  'in',
  'on',
  'for',
  'of',
  'to',
  'and',
  'or',
  'what',
  'whats',
  'any',
  'event',
  'events',
  'activity',
  'activities',
  'building',
  'floor',
  'room',
  'lou',
  '今天',
  '明天',
  '活动',
  '地点',
  '哪里',
  '什么',
  '有没有',
]);

export function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[，。！？、；:：]/g, ' ')
    .replace(/[()[\]{}"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactSearchText(value) {
  return normalizeSearchText(value).replace(/[\s_-]+/g, '');
}

function includesTerm(normalized, compact, term) {
  const termNormalized = normalizeSearchText(term);
  const termCompact = compactSearchText(term);
  return normalized.includes(termNormalized) || (termCompact.length > 1 && compact.includes(termCompact));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeLensId(id) {
  const value = String(id || '');
  const migrated = LEGACY_LENS_MAP[value] || value;
  return STUDENT_LENS_IDS.includes(migrated) ? migrated : '';
}

function isKnownAliasTerm(term) {
  const compactTerm = compactSearchText(term);
  return [...TIME_ALIASES, ...TYPE_ALIASES, ...LENS_ALIASES, ...BUILDING_ALIASES, ...FLOOR_ALIASES].some((group) =>
    group.terms.some((alias) => compactSearchText(alias) === compactTerm),
  );
}

function createEmptyIntent(query = '') {
  return {
    query,
    active: Boolean(String(query).trim()),
    confidence: 0,
    timeFilter: 'all',
    typeIds: [],
    lensIds: [],
    buildingIds: [],
    locationHints: [],
    floor: '',
    room: '',
    keywords: [],
    explanationZh: '',
    explanationEn: '',
  };
}

export function normalizeAgentIntent(query, intent) {
  const fallback = createEmptyIntent(query);
  const safeIntent = intent && typeof intent === 'object' ? intent : {};
  return {
    ...fallback,
    confidence: Number.isFinite(Number(safeIntent.confidence)) ? Math.max(0, Math.min(1, Number(safeIntent.confidence))) : 0,
    timeFilter: TIME_FILTER_IDS.includes(safeIntent.timeFilter) ? safeIntent.timeFilter : 'all',
    typeIds: unique(Array.isArray(safeIntent.typeIds) ? safeIntent.typeIds.filter((id) => EVENT_TYPE_IDS.includes(id)) : []),
    lensIds: unique(Array.isArray(safeIntent.lensIds) ? safeIntent.lensIds.map(normalizeLensId) : []),
    buildingIds: unique(Array.isArray(safeIntent.buildingIds) ? safeIntent.buildingIds.map((id) => String(id).toUpperCase()) : []),
    locationHints: unique(Array.isArray(safeIntent.locationHints) ? safeIntent.locationHints.map(String) : []),
    floor: typeof safeIntent.floor === 'string' ? safeIntent.floor.toUpperCase() : '',
    room: typeof safeIntent.room === 'string' ? safeIntent.room.toUpperCase().replace(/[\s-]/g, '') : '',
    keywords: unique(Array.isArray(safeIntent.keywords) ? safeIntent.keywords.map(String).filter((term) => term.trim().length > 0) : []),
    explanationZh: typeof safeIntent.explanationZh === 'string' ? safeIntent.explanationZh : '',
    explanationEn: typeof safeIntent.explanationEn === 'string' ? safeIntent.explanationEn : '',
  };
}

export function createLocalSearchIntent(query = '') {
  const intent = createEmptyIntent(query);
  const normalized = normalizeSearchText(query);
  const compact = compactSearchText(query);
  if (!normalized) return intent;

  TIME_ALIASES.forEach((group) => {
    if (group.terms.some((term) => includesTerm(normalized, compact, term))) intent.timeFilter = group.id;
  });

  TYPE_ALIASES.forEach((group) => {
    if (group.terms.some((term) => includesTerm(normalized, compact, term))) intent.typeIds.push(...group.ids);
  });

  LENS_ALIASES.forEach((group) => {
    if (group.terms.some((term) => includesTerm(normalized, compact, term))) intent.lensIds.push(...group.ids);
  });

  BUILDING_ALIASES.forEach((group) => {
    if (group.terms.some((term) => includesTerm(normalized, compact, term))) intent.buildingIds.push(group.id);
  });

  FLOOR_ALIASES.forEach((group) => {
    if (group.terms.some((term) => includesTerm(normalized, compact, term))) intent.floor = group.id;
  });

  const roomMatch = normalized.match(/\b[a-z]{1,3}\s*-?\s*\d{3,4}\b/i);
  if (roomMatch) {
    intent.room = roomMatch[0].toUpperCase().replace(/[\s-]/g, '');
    const buildingPrefix = intent.room.match(/^[A-Z]+/)?.[0];
    if (buildingPrefix) intent.buildingIds.push(buildingPrefix);
  }

  if (includesTerm(normalized, compact, 'ai') || includesTerm(normalized, compact, '人工智能')) intent.keywords.push('ai');
  if (includesTerm(normalized, compact, 'coffee') || includesTerm(normalized, compact, '咖啡')) intent.keywords.push('coffee');
  if (includesTerm(normalized, compact, 'tedx')) intent.keywords.push('tedx');
  if (includesTerm(normalized, compact, 'research') || includesTerm(normalized, compact, '研究')) intent.keywords.push('research');

  normalized
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term))
    .filter((term) => !/[\u4e00-\u9fa5]/.test(term) || term.length <= 3)
    .filter((term) => !isKnownAliasTerm(term))
    .forEach((term) => {
      if (!TIME_ALIASES.some((group) => group.terms.some((alias) => compactSearchText(alias) === compactSearchText(term)))) {
        intent.keywords.push(term);
      }
    });

  const normalizedIntent = normalizeAgentIntent(query, {
    ...intent,
    confidence:
      0.25 +
      Math.min(0.65, (intent.typeIds.length + intent.lensIds.length + intent.buildingIds.length + intent.keywords.length) * 0.12),
  });
  return {
    ...normalizedIntent,
    explanationZh: summarizeSearchIntent(normalizedIntent, 'zh') || '按关键词搜索',
    explanationEn: summarizeSearchIntent(normalizedIntent, 'en') || 'Keyword search',
  };
}

function getLocationCorpus(location) {
  if (!location) return '';
  return [
    location.id,
    location.campus,
    location.buildingId,
    location.buildingName,
    location.floor,
    location.room,
    location.area,
    location.entranceHint,
    `${location.buildingId || ''}楼`,
    `${location.buildingId || ''} building`,
    `${location.floor || ''} ${location.room || ''}`,
  ]
    .join(' ')
    .toLowerCase();
}

function getEventCorpus(event, location) {
  return [
    event.title,
    event.summary,
    event.organizer,
    event.audience,
    event.registration,
    event.sourceLabel,
    event.type,
    ...(Array.isArray(event.studentLenses) ? event.studentLenses : []),
    getLocationCorpus(location),
  ]
    .join(' ')
    .toLowerCase();
}

function matchesBuilding(location, buildingId) {
  const target = String(buildingId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const locationBuilding = String(location?.buildingId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const roomPrefix = String(location?.room || '').toUpperCase().match(/^[A-Z]+/)?.[0] || '';
  return locationBuilding === target || roomPrefix === target || compactSearchText(location?.buildingName).includes(target.toLowerCase());
}

export function eventMatchesSearchIntent(event, location, intent) {
  if (!intent?.active) return true;
  if (intent.typeIds.length > 0 && !intent.typeIds.includes(event.type)) return false;

  if (intent.lensIds.length > 0 && !intent.lensIds.includes('all')) {
    const eventLenses = unique(Array.isArray(event.studentLenses) ? event.studentLenses.map(normalizeLensId) : []);
    if (!intent.lensIds.some((lensId) => eventLenses.includes(lensId))) return false;
  }

  if (intent.buildingIds.length > 0 && !intent.buildingIds.some((buildingId) => matchesBuilding(location, buildingId))) return false;
  if (intent.floor && String(location?.floor || '').toUpperCase() !== intent.floor) return false;
  if (intent.room && String(location?.room || '').toUpperCase().replace(/[\s-]/g, '') !== intent.room) return false;

  const corpus = normalizeSearchText(getEventCorpus(event, location));
  const compactCorpus = compactSearchText(corpus);

  if (intent.locationHints.length > 0 && !intent.locationHints.some((hint) => includesTerm(corpus, compactCorpus, hint))) return false;
  if (intent.keywords.length > 0 && !intent.keywords.every((keyword) => includesTerm(corpus, compactCorpus, keyword))) return false;
  return true;
}

export function summarizeSearchIntent(intent, language = 'en') {
  if (!intent?.active) return '';
  const parts = [];
  const timeLabels = {
    today: language === 'zh' ? '今天' : 'today',
    upcoming: language === 'zh' ? '即将开始' : 'upcoming',
    now: language === 'zh' ? '正在进行' : 'now',
    laterToday: language === 'zh' ? '今天稍晚' : 'later today',
    tomorrow: language === 'zh' ? '明天' : 'tomorrow',
    week: language === 'zh' ? '未来7天' : 'next 7 days',
  };
  if (intent.timeFilter && intent.timeFilter !== 'all') parts.push(timeLabels[intent.timeFilter]);
  if (intent.buildingIds?.length) parts.push(intent.buildingIds.join('/'));
  if (intent.floor) parts.push(intent.floor);
  if (intent.room) parts.push(intent.room);
  if (intent.typeIds?.length) parts.push(intent.typeIds.join('/'));
  if (intent.lensIds?.length) parts.push(intent.lensIds.join('/'));
  if (intent.keywords?.length) parts.push(intent.keywords.slice(0, 3).join(', '));
  if (!parts.length) return '';
  return language === 'zh' ? `理解为：${parts.join(' · ')}` : `Understood: ${parts.join(' · ')}`;
}
