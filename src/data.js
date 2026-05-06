export const STORAGE_KEY = 'tc-campus-events-map-v1';

export const EVENT_TYPES = [
  { id: 'academic', label: 'Academic', color: '#315dff' },
  { id: 'forum', label: 'Forum', color: '#7a54e8' },
  { id: 'careers', label: 'Careers', color: '#df6d2f' },
  { id: 'exhibition', label: 'Exhibition', color: '#1f8a70' },
  { id: 'student-life', label: 'Student life', color: '#e7a83d' },
  { id: 'festival', label: 'Festival', color: '#d94b48' },
  { id: 'sports', label: 'Sports', color: '#0f8d57' },
  { id: 'exam', label: 'Exam', color: '#8a4fd3' },
  { id: 'deadline', label: 'Deadline', color: '#c44949' },
];

export const STUDENT_LENSES = [
  { id: 'all', label: 'Collection', labelZh: '\u96c6\u5408', shortLabel: 'Collection', shortLabelZh: '\u96c6\u5408' },
  { id: 'campus', label: 'Campus', labelZh: '\u6821\u56ed', shortLabel: 'Campus', shortLabelZh: '\u6821\u56ed' },
  {
    id: 'ime',
    label: 'School of Intelligent Manufacturing Ecosystem',
    labelZh: '\u667a\u9020\u751f\u6001\u5b66\u9662',
    shortLabel: 'IME',
    shortLabelZh: '\u667a\u9020\u751f\u6001',
  },
  {
    id: 'ai-computing',
    label: 'School of AI and Advanced Computing',
    labelZh: '\u4eba\u5de5\u667a\u80fd\u4e0e\u5148\u8fdb\u8ba1\u7b97\u5b66\u9662',
    shortLabel: 'AI / Computing',
    shortLabelZh: 'AI\u5148\u8fdb\u8ba1\u7b97',
  },
  {
    id: 'fintech-industry',
    label: 'School of Financial Technology and Industry Integration',
    labelZh: '\u4ea7\u91d1\u878d\u5408\u5b66\u9662',
    shortLabel: 'FinTech',
    shortLabelZh: '\u4ea7\u91d1\u878d\u5408',
  },
  {
    id: 'robotics',
    label: 'School of Robotics',
    labelZh: '\u667a\u80fd\u673a\u5668\u4eba\u5b66\u9662',
    shortLabel: 'Robotics',
    shortLabelZh: '\u673a\u5668\u4eba',
  },
  {
    id: 'iot',
    label: 'School of Internet of Things',
    labelZh: '\u7269\u8054\u7f51\u5b66\u9662',
    shortLabel: 'IoT',
    shortLabelZh: '\u7269\u8054\u7f51',
  },
  {
    id: 'cultural-technology',
    label: 'School of Cultural Technology',
    labelZh: '\u6587\u5316\u79d1\u6280\u5b66\u9662',
    shortLabel: 'Culture Tech',
    shortLabelZh: '\u6587\u5316\u79d1\u6280',
  },
  { id: 'chips', label: 'School of CHIPS', labelZh: '\u82af\u7247\u5b66\u9662', shortLabel: 'CHIPS', shortLabelZh: '\u82af\u7247' },
];

const STUDENT_LENS_IDS = new Set(STUDENT_LENSES.map((lens) => lens.id));
const LEGACY_LENS_MAP = {
  'ai-education': 'ai-computing',
  engineering: 'ime',
  business: 'fintech-industry',
  research: 'campus',
  'campus-life': 'campus',
  schoolwide: 'campus',
  'school-wide': 'campus',
};

export const PRECISION_LABELS = {
  campus: 'Campus level',
  building: 'Building level',
  floor: 'Floor level',
  room: 'Room level',
};

export const TC_LOCATION_ANCHORS = [
  { id: 'anchor-01', x: 79.57916557757815, y: 37.287159379780796, lat: 31.48417377769204, lng: 121.15801773317136 },
  { id: 'anchor-02', x: 51.56191992559533, y: 67.13309018264277, lat: 31.48227252686746, lng: 121.15494861253336 },
  { id: 'anchor-03', x: 58.43717913609999, y: 79.68731599188396, lat: 31.481341477053217, lng: 121.15488655135609 },
  { id: 'anchor-04', x: 66.0937178023438, y: 76.2498494012584, lat: 31.48103904490052, lng: 121.15733947229073 },
  { id: 'anchor-05', x: 67.60419141677285, y: 85.36660861987401, lat: 31.481184170782182, lng: 121.15802736412594 },
  { id: 'anchor-06', x: 81.51096572892999, y: 87.0853419151868, lat: 31.48132745080326, lng: 121.15883650382908 },
  { id: 'anchor-07', x: 88.43831023648391, y: 79.76204352646278, lat: 31.48170966598975, lng: 121.15981249540849 },
  { id: 'anchor-08', x: 96.71987246731905, y: 67.65618292469449, lat: 31.482788286292937, lng: 121.16038629483884 },
  { id: 'anchor-09', x: 96.35214846361963, y: 52.52976265150063, lat: 31.483310349619266, lng: 121.16042613716051 },
  { id: 'anchor-10', x: 96.18360439876966, y: 46.887468033081184, lat: 31.48342620100845, lng: 121.1603759064557 },
  { id: 'anchor-11', x: 92.19472819732056, y: 34.232607246054684, lat: 31.484210260427698, lng: 121.15997935045793 },
  { id: 'anchor-12', x: 85.17205882857212, y: 25.28554006541811, lat: 31.48489566899884, lng: 121.158861851187 },
  { id: 'anchor-13', x: 75.05941493757436, y: 19.401432820494957, lat: 31.484938789155766, lng: 121.15769039080254 },
  { id: 'anchor-14', x: 68.54237776337581, y: 20.207474908840595, lat: 31.484284240113666, lng: 121.15634238451898 },
  { id: 'anchor-15', x: 59.77808639117777, y: 25.446748483087234, lat: 31.484538446726702, lng: 121.15636980463043 },
  { id: 'anchor-16', x: 54.98032326028394, y: 31.360583854666846, lat: 31.48351796094977, lng: 121.15586792162027 },
  { id: 'anchor-17', x: 49.73256849978488, y: 44.970754366217406, lat: 31.483121680728747, lng: 121.15546207864483 },
  { id: 'anchor-18', x: 83.16076294277929, y: 34.4800625488663, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-19', x: 83.10626702997274, y: 34.08913213448006, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-20', x: 83.10626702997274, y: 34.4800625488663, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-21', x: 83.26975476839237, y: 34.55824863174355, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-22', x: 83.433242506812, y: 34.71462079749805, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-23', x: 83.433242506812, y: 34.4800625488663, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-24', x: 83.3242506811989, y: 34.401876465989055, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-25', x: 83.26975476839237, y: 34.55824863174355, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-26', x: 83.3242506811989, y: 34.71462079749805, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-27', x: 83.26975476839237, y: 34.6364347146208, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-28', x: 83.433242506812, y: 34.6364347146208, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-29', x: 85.12261580381471, y: 40.81313526192338, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-30', x: 87.95640326975477, y: 40.81313526192338, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-31', x: 88.99182561307903, y: 40.65676309616888, lat: 31.484224393896035, lng: 121.15816063053428 },
  { id: 'anchor-32', x: 96.07629427792915, y: 45.66067240031275, lat: 31.484224393896035, lng: 121.15816063053428 },
];

export const DEFAULT_LOCATIONS = [
  {
    id: 'xec-central',
    campus: 'TC',
    buildingId: 'XEC',
    buildingName: 'XEC Campus',
    floor: '',
    room: '',
    area: 'Central activity area',
    entranceHint: 'Use the main loop road and follow event signage.',
    precision: 'campus',
    mapPoint: { x: 74.2, y: 48.2 },
    verified: true,
  },
  {
    id: 'm-1018',
    campus: 'TC',
    buildingId: 'M',
    buildingName: 'M Building',
    floor: '1F',
    room: 'M-1018',
    area: 'Conference room',
    entranceHint: 'Enter M Building from the south side and follow room signs to M-1018.',
    precision: 'room',
    mapPoint: { x: 60.6, y: 13.8 },
    verified: true,
  },
  {
    id: 'j-students-centre',
    campus: 'TC',
    buildingId: 'J',
    buildingName: 'J Building',
    floor: '',
    room: '',
    area: 'Students Centre area',
    entranceHint: 'Cross the inner bridge toward J Building and look for student activity signage.',
    precision: 'building',
    mapPoint: { x: 65.7, y: 60.7 },
    verified: false,
  },
  {
    id: 'ab-2002',
    campus: 'TC',
    buildingId: 'AB',
    buildingName: 'A-B Building',
    floor: '2F',
    room: 'AB2002',
    area: 'Industry-education forum room',
    entranceHint: 'Use A/B Building entrance, go to 2F, then follow signs to AB2002.',
    precision: 'room',
    mapPoint: { x: 79.2, y: 64.5 },
    verified: true,
  },
  {
    id: 'bc-corridor-2f',
    campus: 'TC',
    buildingId: 'B-C',
    buildingName: 'B-C Buildings',
    floor: '2F',
    room: '',
    area: 'Second-floor corridor',
    entranceHint: 'Go to B or C Building 2F and follow the corridor exhibition line.',
    precision: 'floor',
    mapPoint: { x: 82.4, y: 49.3 },
    verified: true,
  },
  {
    id: 'a-festival-area',
    campus: 'TC',
    buildingId: 'A',
    buildingName: 'A Building',
    floor: '',
    room: '',
    area: 'Festival area',
    entranceHint: 'Use the main A Building entrance and follow festival booths.',
    precision: 'building',
    mapPoint: { x: 76.6, y: 69.5 },
    verified: false,
  },
  {
    id: 'c-innovation-factory',
    campus: 'TC',
    buildingId: 'C',
    buildingName: 'C Building',
    floor: '',
    room: '',
    area: 'Innovation Factory / X3 CoVenture area',
    entranceHint: 'Enter C Building and follow signage for Innovation Factory or X3 CoVenture.',
    precision: 'building',
    mapPoint: { x: 80.7, y: 38.7 },
    verified: false,
  },
];

export const DEFAULT_EVENTS = [
  {
    id: 'tc-icaie-2026',
    title: '2026 2nd International Conference on AI and Education',
    type: 'academic',
    organizer: 'XJTLU Academy of Future Education',
    official: true,
    sourceUrl: 'https://www.xjtlu.edu.cn/en/events/2026/05/2026-2nd-international-conference-on-ai-and-education',
    sourceLabel: 'XJTLU official event',
    startTime: '2026-05-13T10:00',
    endTime: '2026-05-15T17:00',
    locationId: 'xec-central',
    studentLenses: ['ai-computing'],
    summary: 'Hybrid conference on AI-enabled syntegrative education, personalization, and gamification.',
    audience: 'Students and staff interested in AI education',
    registration: 'Check official event page',
    reviewStatus: 'published',
  },
  {
    id: 'tc-teaching-innovation-2026',
    title: '11th Teaching Innovation Award Final',
    type: 'academic',
    organizer: 'XJTLU Institute of Leadership and Education Advanced Development',
    official: true,
    sourceUrl: 'https://www.xjtlu.edu.cn/en/events/2026/05/2026-xjtlu-20th-anniversary-teaching-innovation-award-final-and-the-11th-annual-conference-on-innovation-in-higher-education',
    sourceLabel: 'XJTLU official event',
    startTime: '2026-05-22T09:00',
    endTime: '2026-05-24T21:00',
    locationId: 'm-1018',
    studentLenses: ['ai-computing'],
    summary: 'Higher education innovation conference and national teaching innovation award final.',
    audience: 'Teaching staff, researchers, and students',
    registration: 'Check official event page',
    reviewStatus: 'published',
  },
  {
    id: 'tc-tedx-salon-2026',
    title: 'TEDxXJTLU Salon: Sytergration+',
    type: 'student-life',
    organizer: 'TEDxXJTLU',
    official: false,
    sourceUrl: '',
    sourceLabel: 'Campus activity listing',
    startTime: '2026-05-22T18:30',
    endTime: '2026-05-24T21:00',
    locationId: 'j-students-centre',
    studentLenses: ['campus'],
    summary: 'Salon series for the XJTLU 20th anniversary, including Taicang campus sessions.',
    audience: 'Students',
    registration: 'Follow campus announcement',
    reviewStatus: 'published',
  },
  {
    id: 'tc-belt-road-forum-2026',
    title: 'Belt and Road Industry-Education Forum',
    type: 'forum',
    organizer: 'XJTLU Entrepreneur College (Taicang)',
    official: true,
    sourceUrl: 'https://www.xjtlu.edu.cn/en/events/2026/05/the-belt-and-road-industry-education-integration-and-industrial-innovation-forum',
    sourceLabel: 'XJTLU official event',
    startTime: '2026-05-23T09:00',
    endTime: '2026-05-23T18:00',
    locationId: 'ab-2002',
    studentLenses: ['fintech-industry'],
    summary: 'Forum on industry-education integration and industrial innovation.',
    audience: 'Students, staff, and industry partners',
    registration: 'Check official event page',
    reviewStatus: 'published',
  },
  {
    id: 'tc-research-exhibition-2026',
    title: 'Two Decades of Light Research Exhibition',
    type: 'exhibition',
    organizer: 'XJTLU',
    official: true,
    sourceUrl: 'https://www.xjtlu.edu.cn/en/events/2026/05/research-exhibition-two-decades-of-light-xjtlu20th-anniversary-research-exhibition-of-xjtlu',
    sourceLabel: 'XJTLU official event',
    startTime: '2026-05-26T09:00',
    endTime: '2026-05-31T18:00',
    locationId: 'bc-corridor-2f',
    studentLenses: ['campus'],
    summary: 'Taicang campus phase of the XJTLU 20th anniversary research exhibition.',
    audience: 'All students and staff',
    registration: 'Walk-in',
    reviewStatus: 'published',
  },
  {
    id: 'tc-ime-life-festival-2026',
    title: 'IME Life Festival',
    type: 'festival',
    organizer: 'School of Intelligent Manufacturing Ecosystem',
    official: true,
    sourceUrl: 'https://www.xjtlu.edu.cn/en/events/2026/05/ime-life-festival',
    sourceLabel: 'XJTLU official event',
    startTime: '2026-05-28T11:00',
    endTime: '2026-05-30T17:00',
    locationId: 'a-festival-area',
    studentLenses: ['ime'],
    summary: 'Coffee booths, smart device experiences, industry dialogue, SE exhibition, and social zones.',
    audience: 'Students and visitors',
    registration: 'Check campus announcement',
    reviewStatus: 'published',
  },
  {
    id: 'tc-intelligent-manufacturing-2026',
    title: 'Intelligent Manufacturing Forum',
    type: 'careers',
    organizer: 'XJTLU Entrepreneur College (Taicang)',
    official: true,
    sourceUrl: 'https://www.xjtlu.edu.cn/en/events/2026/05/intelligent-manufacturing-forum-forging-the-future-of-industry',
    sourceLabel: 'XJTLU official event',
    startTime: '2026-05-29T09:00',
    endTime: '2026-05-29T18:00',
    locationId: 'c-innovation-factory',
    studentLenses: ['ime'],
    summary: 'Forum on intelligent manufacturing and future industry opportunities.',
    audience: 'Students, staff, and industry partners',
    registration: 'Check official event page',
    reviewStatus: 'published',
  },
  {
    id: 'tc-high-tech-high-tea-2026',
    title: 'High Tech High Tea x XEC Eco-Partner Conference',
    type: 'forum',
    organizer: 'XJTLU Entrepreneur College (Taicang)',
    official: true,
    sourceUrl: 'https://www.xjtlu.edu.cn/en/events/2025/12/high-tech-high-tea-2026',
    sourceLabel: 'XJTLU official event',
    startTime: '2026-05-30T09:00',
    endTime: '2026-05-30T21:00',
    locationId: 'xec-central',
    studentLenses: ['campus'],
    summary: 'Open Campus, Syntegrated City conference and campus bazar at XEC campus.',
    audience: 'Students, staff, and partners',
    registration: 'Check official event page',
    reviewStatus: 'published',
  },
];

export function createDefaultData() {
  return {
    locations: DEFAULT_LOCATIONS,
    events: DEFAULT_EVENTS,
    updatedAt: new Date().toISOString(),
  };
}

export function getEventType(typeId) {
  return EVENT_TYPES.find((type) => type.id === typeId) || EVENT_TYPES[0];
}

export function getStudentLens(lensId) {
  return STUDENT_LENSES.find((lens) => lens.id === lensId) || STUDENT_LENSES[0];
}

export function normalizeStudentScopeId(scopeId) {
  const normalized = String(scopeId || '').trim();
  const migrated = LEGACY_LENS_MAP[normalized] || normalized;
  return STUDENT_LENS_IDS.has(migrated) ? migrated : 'all';
}

function normalizeAssignableScopeId(scopeId) {
  const normalized = normalizeStudentScopeId(scopeId);
  return normalized === 'all' ? 'campus' : normalized;
}

export function normalizeStudentScopeIds(scopeIds) {
  const ids = Array.isArray(scopeIds) ? scopeIds : [];
  const normalized = [...new Set(ids.map(normalizeAssignableScopeId))].filter((id) => STUDENT_LENS_IDS.has(id));
  return normalized.length ? normalized : ['campus'];
}

export function getEventLenses(event) {
  if (Array.isArray(event.studentLenses) && event.studentLenses.length > 0) return normalizeStudentScopeIds(event.studentLenses);

  const text = `${event.title || ''} ${event.organizer || ''} ${event.summary || ''}`.toLowerCase();
  const lenses = new Set();

  if (text.includes('ai') || text.includes('education') || text.includes('teaching') || text.includes('advanced computing')) {
    lenses.add('ai-computing');
  }
  if (text.includes('manufacturing') || text.includes('ime') || text.includes('intelligent manufacturing')) lenses.add('ime');
  if (text.includes('finance') || text.includes('business') || text.includes('industry-education') || text.includes('partner')) {
    lenses.add('fintech-industry');
  }
  if (text.includes('robot')) lenses.add('robotics');
  if (text.includes('iot') || text.includes('internet of things')) lenses.add('iot');
  if (text.includes('culture') || text.includes('media') || text.includes('design') || text.includes('salon')) {
    lenses.add('cultural-technology');
  }
  if (text.includes('chip') || text.includes('semiconductor')) lenses.add('chips');
  if (event.type === 'festival' || event.type === 'student-life' || text.includes('anniversary') || text.includes('research exhibition')) {
    lenses.add('campus');
  }
  if (lenses.size === 0) lenses.add('campus');

  return [...lenses];
}

export function eventFitsLens(event, lensId) {
  const normalizedLensId = normalizeStudentScopeId(lensId);
  if (normalizedLensId === 'all') return true;
  return getEventLenses(event).includes(normalizedLensId);
}

export function getLocationLabel(location) {
  if (!location) return 'Location not set';
  const room = location.room ? ` ${location.room}` : '';
  const floor = location.floor && !location.room ? ` ${location.floor}` : '';
  const area = location.area ? ` - ${location.area}` : '';
  return `${location.buildingName}${floor}${room}${area}`;
}

export function formatEventTime(event) {
  const start = event.startTime ? new Date(event.startTime) : null;
  const end = event.endTime ? new Date(event.endTime) : null;
  if (!start && !end) return 'Time not set';
  const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(start || end);
  const startTime = start
    ? new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(start)
    : '';
  const endTime = end
    ? new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(end)
    : '';
  if (startTime && endTime) return `${date}, ${startTime} - ${endTime}`;
  return `${date}, ${startTime || endTime}`;
}

export function isPublished(event) {
  return event.reviewStatus === 'published';
}

export function buildLocationStacks(events, locations) {
  return locations
    .map((location) => ({
      location,
      events: events
        .filter((event) => event.locationId === location.id)
        .sort((first, second) => new Date(first.startTime || 0) - new Date(second.startTime || 0)),
    }))
    .filter((stack) => stack.events.length > 0);
}

export function getDataHealth(data) {
  const locationsById = new Map(data.locations.map((location) => [location.id, location]));
  const checks = [];

  data.events.forEach((event) => {
    if (!event.sourceUrl && event.official) {
      checks.push({ level: 'warning', label: `${event.title}: official event needs source URL` });
    }
    if (!event.startTime || !event.endTime) {
      checks.push({ level: 'warning', label: `${event.title}: time window is incomplete` });
    }
    if (!event.organizer) {
      checks.push({ level: 'warning', label: `${event.title}: missing organizer` });
    }
    if (!Array.isArray(event.studentLenses) || event.studentLenses.length === 0) {
      checks.push({ level: 'info', label: `${event.title}: school scope is not set` });
    }
    if (event.reviewStatus === 'published' && !event.sourceUrl && !event.sourceLabel) {
      checks.push({ level: 'info', label: `${event.title}: published event needs a visible source label` });
    }
    if (!locationsById.has(event.locationId)) {
      checks.push({ level: 'error', label: `${event.title}: location is missing` });
    }
  });

  data.locations.forEach((location) => {
    if (!location.verified) {
      checks.push({ level: 'info', label: `${getLocationLabel(location)}: location needs verification` });
    }
    if (location.precision !== 'room' && location.room) {
      checks.push({ level: 'info', label: `${getLocationLabel(location)}: precision can be upgraded to room level` });
    }
  });

  return checks;
}
