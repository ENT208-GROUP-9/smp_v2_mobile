import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  Compass,
  Crosshair,
  ExternalLink,
  AlarmClock,
  ClipboardList,
  Dumbbell,
  GraduationCap,
  LocateFixed,
  MapPin,
  Maximize2,
  MessageSquareText,
  Move,
  Navigation,
  Palette,
  PartyPopper,
  Plus,
  Route,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import campusMap from './assets/xec-campus-map.jpg';
import {
  EVENT_TYPES,
  PRECISION_LABELS,
  STORAGE_KEY,
  STUDENT_LENSES,
  TC_LOCATION_ANCHORS,
  buildLocationStacks,
  createDefaultData,
  eventFitsLens,
  formatEventTime,
  getDataHealth,
  getEventLenses,
  getEventType,
  getLocationLabel,
  getStudentLens,
  normalizeStudentScopeIds,
  normalizeStudentScopeId,
  isPublished,
} from './data';
import {
  createCalibration,
  getScreenNorthBearing,
  isAnchorReady,
  normalizeDegrees,
  projectLocationToMap,
} from './geo';
import { createLocalSearchIntent, eventMatchesSearchIntent, summarizeSearchIntent } from './searchIntent';

function uid(prefix) {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `${prefix}-${randomId}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ANCHORED_PLAYER_POINT = { x: 79.57916557757815, y: 37.287159379780796 };
const ANCHORED_PLAYER_HEADING = 0;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_FILTERS = [
  { id: 'today', label: 'Today', labelZh: '\u4eca\u5929' },
  { id: 'upcoming', label: 'Upcoming', labelZh: '\u5373\u5c06\u5f00\u59cb' },
  { id: 'week', label: 'Next 7 days', labelZh: '\u672a\u67657\u5929' },
  { id: 'all', label: 'All dates', labelZh: '\u5168\u90e8\u65e5\u671f' },
];

const ADMIN_SESSION_KEY = 'tc-campus-events-admin-session-v1';
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'tc-admin-demo';
const PERSONAL_ID_KEY = 'tc-campus-events-personal-id-v1';
const PERSONAL_TASKS_PREFIX = 'tc-campus-events-personal-tasks-v1:';
const PERSONAL_META_PREFIX = 'tc-campus-events-personal-meta-v1:';
const PERSONAL_TASK_COLOR = '#6d2fd4';
const DEFAULT_PERSONAL_SPACE_ID = 'default-personal-space';
const APP_BASE_PATH = import.meta.env.BASE_URL || '/';

function getAppPath(path = '') {
  const base = APP_BASE_PATH.endsWith('/') ? APP_BASE_PATH : `${APP_BASE_PATH}/`;
  return `${base}${String(path).replace(/^\/+/, '')}`;
}

function isAdminRoute() {
  const base = APP_BASE_PATH.endsWith('/') ? APP_BASE_PATH : `${APP_BASE_PATH}/`;
  const pathname = window.location.pathname;
  return window.location.hash === '#admin' || pathname === '/admin' || pathname === `${base}admin`;
}

function isMobileRoute() {
  const base = APP_BASE_PATH.endsWith('/') ? APP_BASE_PATH : `${APP_BASE_PATH}/`;
  const pathname = window.location.pathname;
  return window.location.hash === '#mobile' || window.location.hash.startsWith('#mobile/') || pathname === '/mobile' || pathname === `${base}mobile`;
}

function parseMobileRoute() {
  const hash = window.location.hash.replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });

  if (parts[0] !== 'mobile') return { page: 'map', id: '' };
  const page = parts[1] || 'map';
  const validPages = new Set(['map', 'events', 'personal', 'agent', 'event', 'place', 'task']);
  return validPages.has(page) ? { page, id: parts[2] || '' } : { page: 'map', id: '' };
}

function getMobileHash(page = 'map', id = '') {
  const suffix = id ? `/${encodeURIComponent(id)}` : '';
  return `#mobile/${page}${suffix}`;
}

const UI_TEXT = {
  en: {
    title: 'TC Campus Events Map',
    campus: 'XJTLU Taicang',
    admin: 'Admin',
    search: 'Search events, buildings, organizers',
    recommended: 'Recommended now',
    nextUp: 'Next up',
    nearest: 'Nearest',
    majorPick: 'For this scope',
    open: 'Open',
    showNow: 'Show today',
    showNearest: 'Show nearest',
    place: 'Place',
    eventsHere: 'events here',
    route: 'Route',
    locationSourceLive: 'Live positioning',
    locationSourceAnchor: 'Anchored fallback',
    noEvents: 'No visible events',
    tryFilters: 'Try a different search or filter.',
    time: 'Time',
    location: 'Location',
    organizer: 'Organizer',
    audience: 'Audience',
    howToGetThere: 'How to get there',
    registration: 'Registration',
    source: 'Source',
    freshness: 'Map freshness',
    back: 'Back to place',
    officialSource: 'Open official source',
    mapAgent: 'Map agent',
    nearestHint: 'Turn on location or adjust filters to compare distance.',
  },
  zh: {
    title: 'TC \u6821\u56ed\u6d3b\u52a8\u5730\u56fe',
    campus: '\u897f\u6d66\u592a\u4ed3\u6821\u533a',
    admin: '\u7ba1\u7406\u7aef',
    search: '\u641c\u7d22\u6d3b\u52a8\u3001\u5efa\u7b51\u3001\u7ec4\u7ec7\u8005',
    recommended: '\u5f53\u524d\u63a8\u8350',
    nextUp: '\u4e0b\u4e00\u573a',
    nearest: '\u79bb\u6211\u6700\u8fd1',
    majorPick: '\u5f53\u524d\u8303\u56f4\u63a8\u8350',
    open: '\u6253\u5f00',
    showNow: '\u67e5\u770b\u4eca\u5929',
    showNearest: '\u67e5\u770b\u6700\u8fd1\u5730\u70b9',
    place: '\u5730\u70b9',
    eventsHere: '\u4e2a\u6d3b\u52a8\u5728\u8fd9\u91cc',
    route: '\u8def\u7ebf',
    locationSourceLive: '\u5b9e\u65f6\u5b9a\u4f4d',
    locationSourceAnchor: '\u951a\u70b9\u515c\u5e95',
    noEvents: '\u6682\u65e0\u53ef\u89c1\u6d3b\u52a8',
    tryFilters: '\u6362\u4e00\u4e2a\u641c\u7d22\u6216\u7b5b\u9009\u8bd5\u8bd5\u3002',
    time: '\u65f6\u95f4',
    location: '\u5730\u70b9',
    organizer: '\u7ec4\u7ec7\u8005',
    audience: '\u9002\u5408\u4eba\u7fa4',
    howToGetThere: '\u600e\u4e48\u53bb',
    registration: '\u62a5\u540d',
    source: '\u6765\u6e90',
    freshness: '\u5730\u56fe\u66f4\u65b0',
    back: '\u8fd4\u56de\u5730\u70b9',
    officialSource: '\u6253\u5f00\u5b98\u65b9\u6765\u6e90',
    mapAgent: '\u5730\u56fe\u52a9\u624b',
    nearestHint: '\u5f00\u542f\u5b9a\u4f4d\u6216\u8c03\u6574\u7b5b\u9009\u540e\uff0c\u53ef\u6bd4\u8f83\u8ddd\u79bb\u3002',
  },
};

const PUBLISHED_EVENT_FIELDS = [
  'title',
  'type',
  'organizer',
  'official',
  'sourceUrl',
  'sourceLabel',
  'startTime',
  'endTime',
  'locationId',
  'studentLenses',
  'summary',
  'audience',
  'registration',
];

function createPublishedSnapshot(event) {
  return PUBLISHED_EVENT_FIELDS.reduce(
    (snapshot, field) => ({
      ...snapshot,
      [field]: Array.isArray(event[field]) ? [...event[field]] : event[field],
    }),
    {},
  );
}

function normalizeCampusData(data) {
  const updatedAt = data.updatedAt || new Date().toISOString();
  return {
    ...data,
    locations: data.locations || [],
    events: (data.events || []).map((rawEvent) => {
      const event = {
        ...rawEvent,
        studentLenses: normalizeStudentScopeIds(rawEvent.studentLenses),
        publishedSnapshot: rawEvent.publishedSnapshot
          ? {
              ...rawEvent.publishedSnapshot,
              studentLenses: normalizeStudentScopeIds(rawEvent.publishedSnapshot.studentLenses || rawEvent.studentLenses),
            }
          : rawEvent.publishedSnapshot,
      };
      if ((event.reviewStatus === 'published' || event.reviewStatus === 'changed') && !event.publishedSnapshot) {
        return {
          ...event,
          publishedSnapshot: createPublishedSnapshot(event),
          publishedAt: event.publishedAt || updatedAt,
        };
      }
      return event;
    }),
    updatedAt,
  };
}

function resolveStudentEvent(event) {
  if (event.publishedSnapshot) {
    return {
      id: event.id,
      ...event.publishedSnapshot,
      reviewStatus: 'published',
      draftStatus: event.reviewStatus,
      publishedAt: event.publishedAt,
    };
  }
  if (event.reviewStatus === 'published') return event;
  return null;
}

function getText(language, key) {
  return UI_TEXT[language]?.[key] || UI_TEXT.en[key] || key;
}

function readCampusData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeCampusData(createDefaultData());
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.locations) || !Array.isArray(parsed.events)) return normalizeCampusData(createDefaultData());
    return normalizeCampusData(parsed);
  } catch {
    return normalizeCampusData(createDefaultData());
  }
}

function normalizePersonalId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function readPersonalId() {
  try {
    return normalizePersonalId(localStorage.getItem(PERSONAL_ID_KEY)) || DEFAULT_PERSONAL_SPACE_ID;
  } catch {
    return DEFAULT_PERSONAL_SPACE_ID;
  }
}

function getPersonalTasksKey(personalId) {
  return `${PERSONAL_TASKS_PREFIX}${normalizePersonalId(personalId)}`;
}

function getPersonalMetaKey(personalId) {
  return `${PERSONAL_META_PREFIX}${normalizePersonalId(personalId)}`;
}

function createDefaultPersonalDraft(location = null) {
  return {
    title: '',
    note: '',
    dueTime: '',
    locationId: location?.id || '',
    mapPoint: location?.mapPoint ? { ...location.mapPoint } : { x: 74, y: 48 },
    type: 'personal',
    scopeId: 'all',
    source: 'manual',
    sourceText: '',
  };
}

function normalizePersonalTask(task) {
  return {
    id: task.id || uid('personal-task'),
    title: String(task.title || '').trim() || 'Personal task',
    note: String(task.note || '').trim(),
    dueTime: String(task.dueTime || '').trim(),
    locationId: String(task.locationId || '').trim(),
    mapPoint: clampPoint(task.mapPoint || { x: 74, y: 48 }),
    type: String(task.type || 'personal'),
    scopeId: normalizeStudentScopeId(task.scopeId || task.studentLenses?.[0] || 'all'),
    completed: Boolean(task.completed),
    source: String(task.source || 'manual'),
    sourceText: String(task.sourceText || '').slice(0, 1800),
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: task.updatedAt || new Date().toISOString(),
  };
}

function readPersonalTasks(personalId) {
  if (!personalId) return [];
  try {
    const raw = localStorage.getItem(getPersonalTasksKey(personalId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizePersonalTask) : [];
  } catch {
    return [];
  }
}

function writePersonalTasks(personalId, tasks) {
  if (!personalId) return;
  localStorage.setItem(getPersonalTasksKey(personalId), JSON.stringify(tasks.map(normalizePersonalTask)));
}

function normalizePersonalMeta(meta) {
  const safeMeta = meta && typeof meta === 'object' ? meta : {};
  return {
    reminderTypes: Array.isArray(safeMeta.reminderTypes) ? [...new Set(safeMeta.reminderTypes.map(String))] : [],
    eventReminders:
      safeMeta.eventReminders && typeof safeMeta.eventReminders === 'object'
        ? Object.fromEntries(Object.entries(safeMeta.eventReminders).map(([key, value]) => [key, Boolean(value)]))
        : {},
    eventCheckins:
      safeMeta.eventCheckins && typeof safeMeta.eventCheckins === 'object'
        ? Object.fromEntries(
            Object.entries(safeMeta.eventCheckins).map(([key, value]) => [
              key,
              typeof value === 'object' && value
                ? {
                    checked: Boolean(value.checked),
                    feedback: String(value.feedback || ''),
                    checkedAt: value.checkedAt || '',
                  }
                : { checked: Boolean(value), feedback: '', checkedAt: '' },
            ]),
          )
        : {},
  };
}

function readPersonalMeta(personalId) {
  if (!personalId) return normalizePersonalMeta();
  try {
    const raw = localStorage.getItem(getPersonalMetaKey(personalId));
    return normalizePersonalMeta(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizePersonalMeta();
  }
}

function writePersonalMeta(personalId, meta) {
  if (!personalId) return;
  localStorage.setItem(getPersonalMetaKey(personalId), JSON.stringify(normalizePersonalMeta(meta)));
}

function getPersonalEventState(event, personalMeta) {
  const checkin = personalMeta.eventCheckins?.[event.id];
  return {
    reminded: Boolean(personalMeta.eventReminders?.[event.id]),
    checked: Boolean(checkin?.checked),
    feedback: checkin?.feedback || '',
    checkedAt: checkin?.checkedAt || '',
  };
}

function inferPersonalTaskType(text) {
  const normalized = String(text || '').toLowerCase();
  if (/deadline|due|submit|submission|\u622a\u6b62|\u622a\u6b62\u65e5\u671f|\u63d0\u4ea4|\u5230\u671f/.test(normalized)) return 'deadline';
  if (/exam|quiz|test|midterm|final|\u8003\u8bd5|\u6d4b\u9a8c|\u671f\u4e2d|\u671f\u672b/.test(normalized)) return 'exam';
  if (/sport|sports|basketball|football|soccer|badminton|tennis|run|fitness|\u4f53\u80b2|\u8fd0\u52a8|\u7bee\u7403|\u8db3\u7403|\u7fbd\u6bdb\u7403/.test(normalized)) return 'sports';
  if (/career|job|intern|employer|recruit|\u5c31\u4e1a|\u62db\u8058|\u5b9e\u4e60/.test(normalized)) return 'careers';
  if (/festival|fair|club|society|salon|\u793e\u56e2|\u5e02\u96c6|\u8282|\u6c99\u9f99/.test(normalized)) return 'student-life';
  if (/forum|conference|panel|\u8bba\u575b|\u4f1a\u8bae/.test(normalized)) return 'forum';
  if (/exhibition|display|showcase|\u5c55\u89c8|\u5c55\u793a/.test(normalized)) return 'exhibition';
  if (/lecture|seminar|workshop|course|class|tutorial|\u8bb2\u5ea7|\u8bfe\u7a0b|\u4f5c\u4e1a/.test(normalized)) return 'academic';
  return 'personal';
}

function inferPersonalTaskScope(text) {
  const normalized = String(text || '').toLowerCase();
  if (/ai|advanced computing|\u4eba\u5de5\u667a\u80fd|\u5148\u8fdb\u8ba1\u7b97/.test(normalized)) return 'ai-computing';
  if (/manufacturing|ime|\u667a\u80fd\u5236\u9020|\u667a\u9020\u751f\u6001/.test(normalized)) return 'ime';
  if (/finance|fintech|industry integration|business|\u4ea7\u91d1|\u91d1\u878d/.test(normalized)) return 'fintech-industry';
  if (/robot|\u673a\u5668\u4eba/.test(normalized)) return 'robotics';
  if (/iot|internet of things|\u7269\u8054\u7f51/.test(normalized)) return 'iot';
  if (/culture|media|design|cultural technology|\u6587\u5316|\u4f20\u5a92|\u8bbe\u8ba1/.test(normalized)) return 'cultural-technology';
  if (/chip|semiconductor|\u82af\u7247|\u534a\u5bfc\u4f53/.test(normalized)) return 'chips';
  return 'all';
}

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function createDateTimeLocal(year, month, day, hour = '09', minute = '00') {
  return `${year}-${padDatePart(month)}-${padDatePart(day)}T${padDatePart(hour)}:${padDatePart(minute)}`;
}

function parseEmailDueTime(text) {
  const numericDate = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})(?:[ T,]+(\d{1,2}):(\d{2}))?/);
  if (numericDate) return createDateTimeLocal(numericDate[1], numericDate[2], numericDate[3], numericDate[4] || '09', numericDate[5] || '00');

  const monthNames = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  const monthDate = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,\s*(20\d{2}))?(?:[^\d]+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i,
  );
  if (!monthDate) return '';

  let hour = Number(monthDate[4] || 9);
  if (monthDate[6]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (monthDate[6]?.toLowerCase() === 'am' && hour === 12) hour = 0;
  return createDateTimeLocal(
    monthDate[3] || new Date().getFullYear(),
    monthNames[monthDate[1].toLowerCase()],
    monthDate[2],
    hour,
    monthDate[5] || '00',
  );
}

function compactMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
}

function inferLocationFromText(text, locations) {
  const compactText = compactMatchText(text);
  if (!compactText) return null;
  return (
    locations.find((location) => {
      const candidates = [
        location.room,
        location.buildingId,
        location.buildingName,
        location.area,
        getLocationLabel(location),
        `${location.buildingId || ''}${location.room || ''}`,
      ]
        .map(compactMatchText)
        .filter((candidate) => candidate.length >= 2);
      return candidates.some((candidate) => compactText.includes(candidate));
    }) || null
  );
}

function parseForwardedEmailTask(emailText, locations) {
  const text = String(emailText || '').trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const subject = lines.find((line) => /^subject\s*:/i.test(line));
  const firstContentLine = lines.find((line) => !/^(from|to|cc|bcc|date|sent|subject)\s*:/i.test(line));
  const location = inferLocationFromText(text, locations);
  const fallbackPoint = location?.mapPoint || { x: 74, y: 48 };
  return {
    title: (subject ? subject.replace(/^subject\s*:\s*/i, '') : firstContentLine) || 'Personal task from forwarded email',
    note: text.slice(0, 900),
    dueTime: parseEmailDueTime(text),
    locationId: location?.id || '',
    mapPoint: { ...fallbackPoint },
    type: inferPersonalTaskType(text),
    scopeId: inferPersonalTaskScope(text),
    source: 'forwarded-email',
    sourceText: text,
  };
}

function buildPersonalTaskStacks(tasks, locations) {
  const locationStacks = locations
    .map((location) => ({
      location,
      tasks: tasks
        .filter((task) => !task.completed && task.locationId === location.id)
        .sort((first, second) => new Date(first.dueTime || first.createdAt) - new Date(second.dueTime || second.createdAt)),
    }))
    .filter((stack) => stack.tasks.length > 0);
  const floatingStacks = tasks
    .filter((task) => !task.completed && !task.locationId && task.mapPoint)
    .map((task) => ({
      location: {
        id: `personal-point-${task.id}`,
        campus: 'TC',
        buildingId: '',
        buildingName: 'Personal point',
        area: 'Custom map position',
        entranceHint: 'Custom Personal Space position.',
        precision: 'campus',
        verified: false,
        mapPoint: task.mapPoint,
      },
      tasks: [task],
    }));
  return [...locationStacks, ...floatingStacks];
}

function formatPersonalTaskDue(task) {
  if (!task?.dueTime) return 'No due time';
  const due = new Date(task.dueTime);
  if (Number.isNaN(due.getTime())) return 'Due time not set';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(due);
}

function getPersonalTaskStatus(task, now) {
  if (task.completed) return { label: 'Done', tone: 'muted' };
  const due = task.dueTime ? new Date(task.dueTime).getTime() : null;
  if (!due || Number.isNaN(due)) return { label: 'Open', tone: 'soon' };
  if (due < now) return { label: 'Overdue', tone: 'live' };
  if (due - now < DAY_MS) return { label: 'Today', tone: 'soon' };
  return { label: 'Upcoming', tone: 'upcoming' };
}

function getPersonalTaskTypeLabel(typeId) {
  if (typeId === 'personal') return 'Personal';
  return getEventType(typeId).label || 'Personal';
}

function getScopeLabel(scopeId, language = 'en', compact = false) {
  const scope = getStudentLens(normalizeStudentScopeId(scopeId));
  if (language === 'zh') return compact ? scope.shortLabelZh || scope.labelZh || scope.shortLabel : scope.labelZh || scope.label;
  return compact ? scope.shortLabel : scope.label;
}

function getFilterablePersonalTask(task) {
  return {
    title: task.title,
    summary: task.note,
    organizer: 'Personal Space',
    audience: 'Private',
    registration: '',
    sourceLabel: task.source,
    type: task.type,
    startTime: task.dueTime,
    endTime: task.dueTime,
    locationId: task.locationId,
    studentLenses: [normalizeStudentScopeId(task.scopeId)],
  };
}

function clampPoint(point) {
  return {
    x: Math.min(98, Math.max(2, point.x)),
    y: Math.min(98, Math.max(2, point.y)),
  };
}

function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}

function getEventWindow(event) {
  const startValue = event.startTime || event.dueTime;
  const endValue = event.endTime || event.dueTime || event.startTime;
  const start = startValue ? new Date(startValue).getTime() : null;
  const end = endValue ? new Date(endValue).getTime() : start;
  return { start, end };
}

function dayBounds(now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { start: start.getTime(), end: start.getTime() + DAY_MS };
}

function eventOverlaps(event, startMs, endMs) {
  const eventWindow = getEventWindow(event);
  if (eventWindow.start == null && eventWindow.end == null) return false;
  const start = eventWindow.start ?? eventWindow.end;
  const end = eventWindow.end ?? eventWindow.start;
  return start < endMs && end >= startMs;
}

function eventFitsTime(event, timeFilter, now) {
  if (timeFilter === 'all') return true;
  if (timeFilter === 'today') {
    const bounds = dayBounds(now);
    return eventOverlaps(event, bounds.start, bounds.end);
  }
  if (timeFilter === 'upcoming') {
    const eventWindow = getEventWindow(event);
    return eventWindow.end != null && eventWindow.end >= now;
  }
  if (timeFilter === 'now') {
    const eventWindow = getEventWindow(event);
    return eventWindow.start != null && eventWindow.start <= now && (eventWindow.end ?? eventWindow.start) >= now;
  }
  if (timeFilter === 'laterToday') {
    const bounds = dayBounds(now);
    const eventWindow = getEventWindow(event);
    return eventWindow.start != null && eventWindow.start >= now && eventWindow.start < bounds.end;
  }
  if (timeFilter === 'tomorrow') {
    const today = dayBounds(now);
    return eventOverlaps(event, today.end, today.end + DAY_MS);
  }
  if (timeFilter === 'week') return eventOverlaps(event, now, now + 7 * DAY_MS);
  return true;
}

function getPrimaryTimeFilter(events, now) {
  return ['today', 'upcoming', 'week'].find((filterId) => events.some((event) => eventFitsTime(event, filterId, now))) || 'all';
}

function getTimeFilterLabel(filterId, language) {
  const filter = TIME_FILTERS.find((item) => item.id === filterId) || TIME_FILTERS[TIME_FILTERS.length - 1];
  return language === 'zh' ? filter.labelZh : filter.label;
}

function getTimeActionLabel(filterId, language) {
  if (filterId === 'today') return language === 'zh' ? '\u67e5\u770b\u4eca\u5929' : 'Show today';
  return language === 'zh' ? '\u6253\u5f00' + getTimeFilterLabel(filterId, language) : 'Show ' + getTimeFilterLabel(filterId, language);
}

function getEventStatus(event, now, language = 'en') {
  const eventWindow = getEventWindow(event);
  if (eventWindow.start == null || Number.isNaN(eventWindow.start)) return { label: language === 'zh' ? '\u65f6\u95f4\u672a\u5b9a' : 'Time not set', tone: 'muted' };
  const end = eventWindow.end ?? eventWindow.start;
  if (eventWindow.start <= now && end >= now) return { label: language === 'zh' ? '\u8fdb\u884c\u4e2d' : 'Now', tone: 'live' };
  if (eventWindow.start > now) {
    const days = Math.ceil((eventWindow.start - now) / DAY_MS);
    if (days <= 1) return { label: language === 'zh' ? '\u5373\u5c06\u5f00\u59cb' : 'Soon', tone: 'soon' };
    return { label: language === 'zh' ? days + ' \u5929\u540e' : days + 'd away', tone: 'upcoming' };
  }
  return { label: language === 'zh' ? '\u5df2\u7ed3\u675f' : 'Ended', tone: 'muted' };
}

function formatUpdatedAt(value, now, language = 'en') {
  if (!value) return language === 'zh' ? '\u66f4\u65b0\u65f6\u95f4\u672a\u77e5' : 'Update time unknown';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return language === 'zh' ? '\u66f4\u65b0\u65f6\u95f4\u672a\u77e5' : 'Update time unknown';
  const diff = Math.max(0, now - then);
  if (diff < 60 * 1000) return language === 'zh' ? '\u521a\u521a\u66f4\u65b0' : 'Updated just now';
  if (diff < 60 * 60 * 1000) {
    const mins = Math.floor(diff / 60000);
    return language === 'zh' ? mins + ' \u5206\u949f\u524d\u66f4\u65b0' : 'Updated ' + mins + 'm ago';
  }
  if (diff < DAY_MS) {
    const hours = Math.floor(diff / 3600000);
    return language === 'zh' ? hours + ' \u5c0f\u65f6\u524d\u66f4\u65b0' : 'Updated ' + hours + 'h ago';
  }
  const days = Math.floor(diff / DAY_MS);
  return language === 'zh' ? days + ' \u5929\u524d\u66f4\u65b0' : 'Updated ' + days + 'd ago';
}

function getMapDistance(from, to) {
  if (!from || !to) return null;
  return Math.hypot(from.x - to.x, from.y - to.y);
}

function getRouteSummary(from, location, language = 'en') {
  const distance = getMapDistance(from, location?.mapPoint);
  if (distance == null) return language === 'zh' ? '\u5f00\u542f\u5b9e\u65f6\u5b9a\u4f4d\u540e\u53ef\u6bd4\u8f83\u8ddd\u79bb\u3002' : 'Enable live location to compare distance.';
  if (distance < 8) return language === 'zh' ? '\u79bb\u4f60\u5f53\u524d\u4f4d\u7f6e\u5f88\u8fd1\u3002' : 'Very close from your current point.';
  if (distance < 18) return language === 'zh' ? '\u6821\u5185\u77ed\u8ddd\u79bb\u6b65\u884c\u3002' : 'Short walk across this part of campus.';
  if (distance < 32) return language === 'zh' ? '\u4e2d\u7b49\u8ddd\u79bb\uff0c\u5efa\u8bae\u7ed3\u5408\u5165\u53e3\u63d0\u793a\u3002' : 'Medium campus walk; use the entrance hint.';
  return language === 'zh' ? '\u8de8\u6821\u533a\u8ddd\u79bb\uff0c\u8bf7\u9884\u7559\u66f4\u591a\u6b65\u884c\u65f6\u95f4\u3002' : 'Across campus; allow extra walking time.';
}

function eventMatches(event, location, query) {
  if (!query.trim()) return true;
  const needle = query.toLowerCase();
  return [
    event.title,
    event.summary,
    event.organizer,
    event.audience,
    location ? getLocationLabel(location) : '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

function filterEvents(events, locations, { query, type, lens = 'all', time = 'all', now = 0, publication = 'published', searchIntent }) {
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const effectiveTime = searchIntent?.timeFilter && searchIntent.timeFilter !== 'all' ? searchIntent.timeFilter : time;
  const usesStructuredSearch = Boolean(searchIntent?.active);
  return events
    .filter((event) => (publication === 'all' ? true : isPublished(event)))
    .filter((event) => (type === 'all' ? true : event.type === type))
    .filter((event) => eventFitsLens(event, lens))
    .filter((event) => eventFitsTime(event, effectiveTime, now))
    .filter((event) => eventMatchesSearchIntent(event, locationsById.get(event.locationId), searchIntent))
    .filter((event) => (usesStructuredSearch ? true : eventMatches(event, locationsById.get(event.locationId), query)))
    .sort((first, second) => new Date(first.startTime || 0) - new Date(second.startTime || 0));
}

function personalTaskMatches(task, location, query) {
  if (!query.trim()) return true;
  const needle = query.toLowerCase();
  return [
    task.title,
    task.note,
    task.source,
    getPersonalTaskTypeLabel(task.type),
    getScopeLabel(task.scopeId),
    location ? getLocationLabel(location) : 'Custom point',
  ]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

function filterPersonalTasks(tasks, locations, { query, type, lens = 'all', time = 'all', now = 0, searchIntent }) {
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const effectiveTime = searchIntent?.timeFilter && searchIntent.timeFilter !== 'all' ? searchIntent.timeFilter : time;
  const usesStructuredSearch = Boolean(searchIntent?.active);
  return tasks
    .filter((task) => !task.completed)
    .filter((task) => (type === 'all' ? true : task.type === type))
    .filter((task) => eventFitsLens(getFilterablePersonalTask(task), lens))
    .filter((task) => eventFitsTime(getFilterablePersonalTask(task), effectiveTime, now))
    .filter((task) => eventMatchesSearchIntent(getFilterablePersonalTask(task), locationsById.get(task.locationId), searchIntent))
    .filter((task) => (usesStructuredSearch ? true : personalTaskMatches(task, locationsById.get(task.locationId), query)))
    .sort((first, second) => new Date(first.dueTime || first.createdAt) - new Date(second.dueTime || second.createdAt));
}

function useCampusData() {
  const [data, setData] = useState(readCampusData);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const updateData = (producer) => {
    setData((current) => ({
      ...producer(current),
      updatedAt: new Date().toISOString(),
    }));
  };

  return [data, updateData, setData];
}

function TypePill({ typeId }) {
  const type = getEventType(typeId);
  return (
    <span className="type-pill" style={{ '--type-color': type.color }}>
      <EventTypeIcon typeId={typeId} size={13} />
      {type.label}
    </span>
  );
}

function EventTypeIcon({ typeId, size = 16 }) {
  if (typeId === 'academic') return <GraduationCap size={size} />;
  if (typeId === 'forum') return <MessageSquareText size={size} />;
  if (typeId === 'careers') return <BriefcaseBusiness size={size} />;
  if (typeId === 'exhibition') return <Palette size={size} />;
  if (typeId === 'student-life') return <Users size={size} />;
  if (typeId === 'festival') return <PartyPopper size={size} />;
  if (typeId === 'sports') return <Dumbbell size={size} />;
  if (typeId === 'exam') return <ClipboardList size={size} />;
  if (typeId === 'deadline') return <AlarmClock size={size} />;
  return <Sparkles size={size} />;
}

function TrustBadges({ event, location }) {
  return (
    <div className="trust-row">
      <span className={event.official ? 'trust-badge official' : 'trust-badge'}>
        {event.official ? <ShieldCheck size={14} /> : <Users size={14} />}
        {event.official ? 'Official' : 'Campus group'}
      </span>
      <span className={location?.verified ? 'trust-badge verified' : 'trust-badge warning'}>
        {location?.verified ? <CheckCircle2 size={14} /> : <LocateFixed size={14} />}
        {location?.verified ? 'Verified location' : 'Needs location check'}
      </span>
      <span className="trust-badge">{PRECISION_LABELS[location?.precision] || 'Location level'}</span>
    </div>
  );
}

function CampusMap({
  stacks,
  locations = [],
  personalTasks = [],
  personalMode = false,
  personalMeta = normalizePersonalMeta(),
  selectedLocationId,
  selectedEventId,
  selectedPersonalTaskId,
  onSelectLocation,
  onSelectPersonalTask,
  admin = false,
  editMode = false,
  onMoveLocation,
  onMovePersonalTask,
  onLocationSnapshot,
  language = 'en',
  t = (key) => getText('en', key),
}) {
  const mapRef = useRef(null);
  const dragRef = useRef(null);
  const personalDragRef = useRef(null);
  const suppressPersonalClickRef = useRef(null);
  const currentLocationRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [personalDraggingId, setPersonalDraggingId] = useState(null);
  const [locatorOn, setLocatorOn] = useState(!admin);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [geoStatus, setGeoStatus] = useState(() =>
    typeof navigator === 'undefined' || navigator.geolocation ? 'idle' : 'unsupported',
  );
  const [geoError, setGeoError] = useState(() =>
    typeof navigator === 'undefined' || navigator.geolocation ? '' : 'Geolocation is not supported in this browser.',
  );
  const [deviceHeading, setDeviceHeading] = useState(null);
  const [orientationGranted, setOrientationGranted] = useState(false);
  const [orientationStatus, setOrientationStatus] = useState(() => {
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') return 'unsupported';
    return typeof window.DeviceOrientationEvent.requestPermission === 'function' ? 'needs-permission' : 'idle';
  });
  const [orientationError, setOrientationError] = useState('');
  const [locationHudOpen, setLocationHudOpen] = useState(false);

  const readyAnchors = useMemo(() => TC_LOCATION_ANCHORS.filter((anchor) => isAnchorReady(anchor)), []);
  const calibration = useMemo(() => createCalibration(readyAnchors), [readyAnchors]);
  const screenNorthBearing = useMemo(() => getScreenNorthBearing(calibration), [calibration]);
  const personalTaskStacks = useMemo(() => buildPersonalTaskStacks(personalTasks, locations), [locations, personalTasks]);
  const liveMapPoint = useMemo(
    () => projectLocationToMap(currentLocation, readyAnchors, calibration),
    [calibration, currentLocation, readyAnchors],
  );
  const playerPoint = liveMapPoint ? clampPoint(liveMapPoint) : ANCHORED_PLAYER_POINT;
  const rawHeading = currentLocation?.heading ?? deviceHeading;
  const playerHeading =
    rawHeading == null
      ? ANCHORED_PLAYER_HEADING
      : screenNorthBearing == null
        ? normalizeDegrees(rawHeading)
        : normalizeDegrees(screenNorthBearing + rawHeading);
  const accuracyScale = Math.min(2.4, Math.max(0.9, (currentLocation?.accuracy || 12) / 11));
  const positionLabel =
    geoStatus === 'active' && currentLocation
      ? language === 'zh'
        ? '\u5b9e\u65f6\u5b9a\u4f4d'
        : 'Live positioning'
      : geoStatus === 'requesting'
        ? language === 'zh'
          ? '\u6b63\u5728\u5b9a\u4f4d'
          : 'Locating...'
        : geoStatus === 'unsupported'
          ? language === 'zh'
            ? '\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u5b9a\u4f4d'
            : 'Unsupported'
          : liveMapPoint
            ? t('locationSourceLive')
            : t('locationSourceAnchor');
  const locationSnapshot = useMemo(
    () => ({
      point: playerPoint,
      accuracy: currentLocation?.accuracy || null,
      source: liveMapPoint ? 'live' : 'anchor',
      geoStatus,
      geoError,
      orientationStatus,
      orientationError,
      label: positionLabel,
      anchors: readyAnchors.length,
    }),
    [
      currentLocation?.accuracy,
      geoError,
      geoStatus,
      liveMapPoint,
      orientationError,
      orientationStatus,
      playerPoint,
      positionLabel,
      readyAnchors.length,
    ],
  );

  const getPointFromEvent = useCallback((event) => {
    const bounds = mapRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return clampPoint({
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    });
  }, []);

  const startDrag = (event, location) => {
    if (!admin || !editMode) return;
    if (event.button != null && event.button !== 0) return;
    const point = getPointFromEvent(event);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      locationId: location.id,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPoint: point,
      originalPoint: { ...location.mapPoint },
      moved: false,
    };
    setDraggingId(location.id);
  };

  const startPersonalTaskDrag = (event, task) => {
    if (admin || !personalMode || !onMovePersonalTask) return;
    if (event.button != null && event.button !== 0) return;
    const point = getPointFromEvent(event);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    personalDragRef.current = {
      taskId: task.id,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPoint: point,
      originalPoint: { ...(task.mapPoint || point) },
      moved: false,
    };
    setPersonalDraggingId(task.id);
  };

  useEffect(() => {
    const handleMove = (event) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const distance = Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y);
      if (distance > 3) drag.moved = true;
      if (!drag.moved) return;

      const point = getPointFromEvent(event);
      if (!point) return;
      event.preventDefault();
      onMoveLocation?.(drag.locationId, clampPoint({
        x: drag.originalPoint.x + (point.x - drag.startPoint.x),
        y: drag.originalPoint.y + (point.y - drag.startPoint.y),
      }), drag.originalPoint);
    };

    const handleEnd = (event) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      setDraggingId(null);
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, [getPointFromEvent, onMoveLocation]);

  useEffect(() => {
    const handleMove = (event) => {
      const drag = personalDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const distance = Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y);
      if (distance > 3) drag.moved = true;
      if (!drag.moved) return;

      const point = getPointFromEvent(event);
      if (!point) return;
      event.preventDefault();
      onMovePersonalTask?.(
        drag.taskId,
        clampPoint({
          x: drag.originalPoint.x + (point.x - drag.startPoint.x),
          y: drag.originalPoint.y + (point.y - drag.startPoint.y),
        }),
      );
    };

    const handleEnd = (event) => {
      const drag = personalDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.moved) {
        suppressPersonalClickRef.current = drag.taskId;
        window.setTimeout(() => {
          if (suppressPersonalClickRef.current === drag.taskId) suppressPersonalClickRef.current = null;
        }, 250);
      }
      personalDragRef.current = null;
      setPersonalDraggingId(null);
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, [getPointFromEvent, onMovePersonalTask]);

  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  useEffect(() => {
    if (admin) return;
    onLocationSnapshot?.(locationSnapshot);
  }, [admin, locationSnapshot, onLocationSnapshot]);

  useEffect(() => {
    if (admin || !locatorOn) return undefined;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const sample = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading:
            typeof position.coords.heading === 'number' && !Number.isNaN(position.coords.heading)
              ? normalizeDegrees(position.coords.heading)
              : null,
          timestamp: position.timestamp,
        };

        setCurrentLocation(sample);
        setGeoStatus('active');
        setGeoError('');
      },
      (error) => {
        const isTimeout = error?.code === 3;
        if (isTimeout && currentLocationRef.current) {
          setGeoStatus('active');
          setGeoError('');
          return;
        }

        setGeoStatus('error');
        setGeoError(
          isTimeout
            ? 'Location response is slow. Stay still for a moment or move to an open area.'
            : error.message || 'Unable to get location.',
        );
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 25000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [admin, locatorOn]);

  useEffect(() => {
    if (admin || !locatorOn) return undefined;
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      return undefined;
    }

    const orientationEvent = window.DeviceOrientationEvent;
    if (typeof orientationEvent.requestPermission === 'function' && !orientationGranted) {
      return undefined;
    }

    const handleOrientation = (event) => {
      let nextHeading = null;
      if (typeof event.webkitCompassHeading === 'number') {
        nextHeading = normalizeDegrees(event.webkitCompassHeading);
      } else if (typeof event.alpha === 'number') {
        nextHeading = normalizeDegrees(360 - event.alpha);
      }

      if (nextHeading == null || Number.isNaN(nextHeading)) return;
      setDeviceHeading((previous) => {
        if (previous == null) return nextHeading;
        const delta = ((nextHeading - previous + 540) % 360) - 180;
        return normalizeDegrees(previous + delta * 0.22);
      });
      setOrientationStatus('active');
      setOrientationError('');
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [admin, locatorOn, orientationGranted]);

  const requestLocationRefresh = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('unsupported');
      setGeoError('Geolocation is not supported in this browser.');
      return;
    }

    setLocatorOn(true);
    setGeoStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const sample = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading:
            typeof position.coords.heading === 'number' && !Number.isNaN(position.coords.heading)
              ? normalizeDegrees(position.coords.heading)
              : null,
          timestamp: position.timestamp,
        };
        setCurrentLocation(sample);
        setGeoStatus('active');
        setGeoError('');
      },
      (error) => {
        setGeoStatus('error');
        setGeoError(error.message || 'Unable to refresh location.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 18000 },
    );
  };

  const requestOrientationAccess = async () => {
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      setOrientationStatus('unsupported');
      setOrientationError('Device heading is not available here.');
      return;
    }

    const orientationEvent = window.DeviceOrientationEvent;
    if (typeof orientationEvent.requestPermission !== 'function') {
      setOrientationGranted(true);
      setOrientationStatus('idle');
      return;
    }

    try {
      const response = await orientationEvent.requestPermission();
      if (response === 'granted') {
        setOrientationGranted(true);
        setOrientationStatus('idle');
        setOrientationError('');
      } else {
        setOrientationStatus('denied');
        setOrientationError('Motion permission was not granted.');
      }
    } catch (error) {
      setOrientationStatus('error');
      setOrientationError(error?.message || 'Unable to request heading permission.');
    }
  };

  return (
    <div className={`campus-map ${admin && editMode ? 'edit-mode' : ''}`}>
      <div className="map-plane">
        <TransformWrapper
          minScale={1}
          maxScale={admin ? 3.4 : 1}
          centerOnInit
          doubleClick={{ disabled: true }}
          wheel={{ disabled: !admin, step: 0.12 }}
          pinch={{ disabled: !admin }}
          panning={{ disabled: !admin || (admin && editMode) }}
        >
          {({ zoomIn, zoomOut, resetTransform, centerView }) => (
            <>
              <TransformComponent wrapperClass="map-transform-wrapper" contentClass="map-transform-content">
                <div className="map-canvas" ref={mapRef}>
                  <img src={campusMap} alt="XEC campus map" draggable="false" />
                  {!admin && locatorOn && (
                    <div
                      className="player-location"
                      style={{
                        left: `${playerPoint.x}%`,
                        top: `${playerPoint.y}%`,
                        '--accuracy-scale': accuracyScale,
                      }}
                      title={geoError || 'Your live position and facing direction'}
                    >
                      <span className="player-accuracy" />
                      <span className="player-pulse" />
                      <span
                        className="player-bearing"
                        style={{ transform: `translate(-50%, -50%) rotate(${playerHeading}deg)` }}
                      />
                      <span
                        className="player-arrow"
                        style={{ transform: `translate(-50%, -50%) rotate(${playerHeading}deg)` }}
                      />
                      <span className="player-dot" />
                    </div>
                  )}
                  {stacks.map((stack) => {
                    const location = stack.location;
                    const primaryEvent = stack.events[0];
                    const type = getEventType(primaryEvent?.type || 'academic');
                    const typeIds = [...new Set(stack.events.map((event) => event.type))];
                    const mixedTypes = typeIds.length > 1;
                    const personalStates = personalMode
                      ? stack.events.map((event) => getPersonalEventState(event, personalMeta))
                      : [];
                    const hasPersonalReminder = personalStates.some((state) => state.reminded);
                    const hasPersonalCheckin = personalStates.some((state) => state.checked);
                    const selected =
                      selectedLocationId === location.id || stack.events.some((event) => event.id === selectedEventId);
                    return (
                      <button
                        key={location.id}
                        className={`map-marker ${admin ? 'with-label' : 'icon-only'} ${selected ? 'selected' : ''} ${
                          stack.events.length > 1 ? 'stacked' : ''
                        } ${personalMode ? 'personal-mode-marker' : ''} ${hasPersonalReminder ? 'personal-reminded' : ''} ${
                          hasPersonalCheckin ? 'personal-checked' : ''
                        } ${draggingId === location.id ? 'dragging' : ''}`}
                        style={{
                          left: `${location.mapPoint.x}%`,
                          top: `${location.mapPoint.y}%`,
                          '--type-color': type.color,
                        }}
                        onPointerDown={(event) => startDrag(event, location)}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectLocation(location.id);
                        }}
                        title={`${getLocationLabel(location)}${
                          hasPersonalCheckin ? ' / checked in' : hasPersonalReminder ? ' / personal reminder on' : ''
                        }`}
                      >
                        <span className={`marker-pin ${mixedTypes ? 'mixed' : ''}`}>
                          {mixedTypes ? (
                            typeIds.slice(0, 3).map((typeId) => (
                              <span key={typeId} className="mini-type-icon">
                                <EventTypeIcon typeId={typeId} size={12} />
                              </span>
                            ))
                          ) : (
                            <EventTypeIcon typeId={primaryEvent?.type || 'academic'} size={18} />
                          )}
                          {stack.events.length > 1 && <b>{stack.events.length}</b>}
                        </span>
                        {admin && <span className="marker-label">{getLocationLabel(location)}</span>}
                      </button>
                    );
                  })}
                  {!admin &&
                    personalTaskStacks.map((stack) => {
                      const selected = stack.tasks.some((task) => task.id === selectedPersonalTaskId);
                      const primaryTask = stack.tasks[0];
                      const typeIds = [...new Set(stack.tasks.map((task) => task.type))];
                      const mixedTypes = typeIds.length > 1;
                      const type = primaryTask.type === 'personal' ? { color: PERSONAL_TASK_COLOR } : getEventType(primaryTask.type);
                      return (
                        <button
                          key={`personal-${stack.location.id}`}
                          className={`personal-task-marker ${selected ? 'selected' : ''} ${personalDraggingId === primaryTask.id ? 'dragging' : ''}`}
                          style={{
                            left: `${stack.location.mapPoint.x}%`,
                            top: `${stack.location.mapPoint.y}%`,
                            '--personal-color': type.color,
                          }}
                          onPointerDown={(event) => startPersonalTaskDrag(event, primaryTask)}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (suppressPersonalClickRef.current === primaryTask.id) {
                              suppressPersonalClickRef.current = null;
                              return;
                            }
                            onSelectPersonalTask?.(primaryTask.id, stack.location.id);
                          }}
                          title={`${stack.tasks.length} personal task${stack.tasks.length === 1 ? '' : 's'} at ${getLocationLabel(stack.location)}`}
                        >
                          <span className={`personal-task-pin ${mixedTypes ? 'mixed' : ''}`}>
                            {mixedTypes ? (
                              typeIds.slice(0, 3).map((typeId) => (
                                <span key={typeId} className="mini-type-icon">
                                  <EventTypeIcon typeId={typeId} size={12} />
                                </span>
                              ))
                            ) : (
                              <EventTypeIcon typeId={primaryTask.type} size={18} />
                            )}
                            {stack.tasks.length > 1 && <b>{stack.tasks.length}</b>}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </TransformComponent>

              {admin && (
                <div className="map-zoom-tools">
                  <button onClick={() => zoomIn(0.35)} aria-label="Zoom in" title="Zoom in">
                    <ZoomIn size={16} />
                  </button>
                  <button onClick={() => zoomOut(0.35)} aria-label="Zoom out" title="Zoom out">
                    <ZoomOut size={16} />
                  </button>
                  <button onClick={() => resetTransform()} aria-label="Reset map view" title="Reset map view">
                    <Maximize2 size={16} />
                  </button>
                  <button onClick={() => centerView(1.6)} aria-label="Focus map" title="Focus map">
                    <Crosshair size={16} />
                  </button>
                </div>
              )}

              {!admin && (
                <div className={`map-tools ${locationHudOpen ? 'open' : 'collapsed'}`}>
                  <button
                    className={`map-tool-toggle ${locatorOn ? 'active' : ''}`}
                    onClick={() => setLocationHudOpen((value) => !value)}
                    aria-label={locationHudOpen ? 'Collapse location controls' : 'Open location controls'}
                    title={locationHudOpen ? 'Collapse location controls' : positionLabel}
                  >
                    <LocateFixed size={17} />
                  </button>
                  {locationHudOpen && (
                    <div className="map-tool-popover">
                      <button
                        className={locatorOn ? 'active' : ''}
                        onClick={() => {
                          if (locatorOn) {
                            setLocatorOn(false);
                            setGeoStatus('idle');
                          } else {
                            requestLocationRefresh();
                          }
                        }}
                        aria-label={locatorOn ? 'Hide current position' : 'Show live current position'}
                        title={geoError || (locatorOn ? 'Hide current position' : 'Show live current position')}
                      >
                        <LocateFixed size={17} />
                        <span>{locatorOn ? positionLabel : language === 'zh' ? '\u5b9a\u4f4d\u5173\u95ed' : 'Position off'}</span>
                      </button>
                      <button
                        className={orientationStatus === 'active' ? 'active' : ''}
                        onClick={requestOrientationAccess}
                        aria-label="Enable heading"
                        title={orientationError || 'Enable heading'}
                      >
                        <Compass size={17} />
                        <span>
                          {orientationStatus === 'active'
                            ? language === 'zh'
                              ? '\u671d\u5411\u5df2\u5f00'
                              : 'Heading on'
                            : language === 'zh'
                              ? '\u5f00\u542f\u671d\u5411'
                              : 'Heading'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </TransformWrapper>
      </div>
    </div>
  );
}

function StudentApp({ data, mobile = false }) {
  const now = useNow();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [lensFilter, setLensFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [locationSnapshot, setLocationSnapshot] = useState(null);
  const [language, setLanguage] = useState('en');
  const [sheetMode, setSheetMode] = useState('peek');
  const [agentSearch, setAgentSearch] = useState({ status: 'idle', source: 'local', intent: createLocalSearchIntent('') });
  const [personalId] = useState(readPersonalId);
  const [personalTasks, setPersonalTasks] = useState(() => readPersonalTasks(readPersonalId()));
  const [personalMeta, setPersonalMeta] = useState(() => readPersonalMeta(readPersonalId()));
  const [personalTaskDraft, setPersonalTaskDraft] = useState(() => createDefaultPersonalDraft());
  const [forwardedEmail, setForwardedEmail] = useState('');
  const [aiDraftReady, setAiDraftReady] = useState(false);
  const [selectedPersonalTaskId, setSelectedPersonalTaskId] = useState(null);
  const [personalNotice, setPersonalNotice] = useState('');
  const [personalSpaceOpen, setPersonalSpaceOpen] = useState(false);
  const [personalMode, setPersonalMode] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [detailPanelOpen, setDetailPanelOpen] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileRoute, setMobileRoute] = useState(parseMobileRoute);
  const [mobileBackTarget, setMobileBackTarget] = useState('map');
  const t = useCallback((key) => getText(language, key), [language]);
  const studentEvents = useMemo(() => data.events.map(resolveStudentEvent).filter(Boolean), [data.events]);
  const localSearchIntent = useMemo(() => createLocalSearchIntent(query), [query]);
  const effectiveSearchIntent = agentSearch.intent?.query === query ? agentSearch.intent : localSearchIntent;

  const visibleEvents = useMemo(
    () =>
      filterEvents(studentEvents, data.locations, {
        query,
        type: typeFilter,
        lens: lensFilter,
        time: timeFilter,
        now,
        publication: 'all',
        searchIntent: effectiveSearchIntent,
      }),
    [studentEvents, data.locations, query, typeFilter, lensFilter, now, timeFilter, effectiveSearchIntent],
  );
  const stacks = useMemo(() => buildLocationStacks(visibleEvents, data.locations), [data.locations, visibleEvents]);
  const allStudentStacks = useMemo(() => buildLocationStacks(studentEvents, data.locations), [data.locations, studentEvents]);
  const locationsById = useMemo(() => new Map(data.locations.map((location) => [location.id, location])), [data.locations]);
  const selectedLocation = locationsById.get(selectedLocationId) || stacks[0]?.location || null;
  const selectedStack = stacks.find((stack) => stack.location.id === selectedLocation?.id) || null;
  const selectedEvent = visibleEvents.find((event) => event.id === selectedEventId) || null;
  const publishedEvents = studentEvents;
  const selectedPersonalTask = personalTasks.find((task) => task.id === selectedPersonalTaskId) || null;
  const openPersonalTasks = useMemo(() => personalTasks.filter((task) => !task.completed), [personalTasks]);
  const filteredPersonalTasks = useMemo(
    () =>
      filterPersonalTasks(openPersonalTasks, data.locations, {
        query,
        type: typeFilter,
        lens: lensFilter,
        time: timeFilter,
        now,
        searchIntent: effectiveSearchIntent,
      }),
    [openPersonalTasks, data.locations, query, typeFilter, lensFilter, timeFilter, now, effectiveSearchIntent],
  );
  const visiblePersonalTasks = personalMode ? filteredPersonalTasks : [];
  const selectedLocationPersonalTasks = selectedLocation
    ? visiblePersonalTasks.filter((task) => task.locationId === selectedLocation.id)
    : [];
  const remindedPublicEvents = useMemo(
    () => publishedEvents.filter((event) => getPersonalEventState(event, personalMeta).reminded),
    [personalMeta, publishedEvents],
  );
  const checkedPublicEvents = useMemo(
    () => publishedEvents.filter((event) => getPersonalEventState(event, personalMeta).checked),
    [personalMeta, publishedEvents],
  );
  const checkedEventCount = checkedPublicEvents.length;
  const remindedEventCount = remindedPublicEvents.length;
  const lensCounts = useMemo(() => {
    const counts = new Map();
    const countable = personalMode ? [...publishedEvents, ...openPersonalTasks.map(getFilterablePersonalTask)] : publishedEvents;
    STUDENT_LENSES.forEach((lens) => {
      counts.set(lens.id, countable.filter((event) => eventFitsLens(event, lens.id)).length);
    });
    return counts;
  }, [openPersonalTasks, personalMode, publishedEvents]);
  const timeCounts = useMemo(() => {
    const counts = new Map();
    const countable = personalMode ? [...publishedEvents, ...openPersonalTasks.map(getFilterablePersonalTask)] : publishedEvents;
    TIME_FILTERS.forEach((filter) => {
      counts.set(filter.id, countable.filter((event) => eventFitsTime(event, filter.id, now)).length);
    });
    return counts;
  }, [now, openPersonalTasks, personalMode, publishedEvents]);
  const updatedLabel = formatUpdatedAt(data.updatedAt, now, language);

  const updatePersonalMeta = useCallback(
    (producer) => {
      if (!personalId) {
        setPersonalNotice('Personal Space is preparing. Try again in a moment.');
        return normalizePersonalMeta();
      }
      let nextMeta = normalizePersonalMeta();
      setPersonalMeta((current) => {
        nextMeta = normalizePersonalMeta(producer(current));
        writePersonalMeta(personalId, nextMeta);
        return nextMeta;
      });
      return nextMeta;
    },
    [personalId],
  );

  const toggleEventReminder = useCallback(
    (eventId) => {
      updatePersonalMeta((current) => ({
        ...current,
        eventReminders: {
          ...current.eventReminders,
          [eventId]: !current.eventReminders?.[eventId],
        },
      }));
    },
    [updatePersonalMeta],
  );

  const toggleEventCheckin = useCallback(
    (eventId, feedback = '') => {
      updatePersonalMeta((current) => {
        const currentCheckin = current.eventCheckins?.[eventId] || {};
        const checked = !currentCheckin.checked;
        return {
          ...current,
          eventCheckins: {
            ...current.eventCheckins,
            [eventId]: {
              checked,
              feedback: checked ? feedback || currentCheckin.feedback || 'Checked in from Personal Space' : currentCheckin.feedback || '',
              checkedAt: checked ? new Date().toISOString() : currentCheckin.checkedAt || '',
            },
          },
        };
      });
    },
    [updatePersonalMeta],
  );

  const updateEventFeedback = useCallback(
    (eventId, feedback) => {
      updatePersonalMeta((current) => {
        const currentCheckin = current.eventCheckins?.[eventId] || {};
        return {
          ...current,
          eventCheckins: {
            ...current.eventCheckins,
            [eventId]: {
              checked: true,
              feedback: String(feedback || '').trim(),
              checkedAt: currentCheckin.checkedAt || new Date().toISOString(),
            },
          },
        };
      });
    },
    [updatePersonalMeta],
  );

  const updatePersonalTasks = useCallback(
    (producer) => {
      if (!personalId) {
        setPersonalNotice('Personal Space is preparing. Try again in a moment.');
        return [];
      }
      let nextTasks = [];
      setPersonalTasks((current) => {
        nextTasks = producer(current).map(normalizePersonalTask);
        writePersonalTasks(personalId, nextTasks);
        return nextTasks;
      });
      return nextTasks;
    },
    [personalId],
  );

  const createPersonalTask = useCallback(
    (draft) => {
      if (!personalId) {
        setPersonalNotice('Personal Space is preparing. Try again in a moment.');
        return null;
      }
      const draftLocation = locationsById.get(draft.locationId);
      const task = normalizePersonalTask({
        ...draft,
        mapPoint: draft.mapPoint || draftLocation?.mapPoint || { x: 74, y: 48 },
        id: uid('personal-task'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      updatePersonalTasks((current) => [task, ...current]);
      setSelectedPersonalTaskId(task.id);
      if (task.locationId) setSelectedLocationId(task.locationId);
      setSelectedEventId(null);
      setSheetMode('half');
      setPersonalMode(true);
      setPersonalSpaceOpen(true);
      setPersonalNotice(`Added private task: ${task.title}`);
      return task;
    },
    [locationsById, personalId, updatePersonalTasks],
  );

  const updatePersonalTask = useCallback(
    (taskId, patch) => {
      updatePersonalTasks((current) =>
        current.map((task) =>
          task.id === taskId ? normalizePersonalTask({ ...task, ...patch, updatedAt: new Date().toISOString() }) : task,
        ),
      );
    },
    [updatePersonalTasks],
  );

  const deletePersonalTask = useCallback(
    (taskId) => {
      updatePersonalTasks((current) => current.filter((task) => task.id !== taskId));
      if (selectedPersonalTaskId === taskId) setSelectedPersonalTaskId(null);
      setPersonalNotice('Private task removed.');
    },
    [selectedPersonalTaskId, updatePersonalTasks],
  );

  const submitPersonalTaskDraft = useCallback(() => {
    const task = createPersonalTask({
      ...personalTaskDraft,
      source: personalTaskDraft.source || (aiDraftReady ? 'forwarded-email' : 'manual'),
    });
    if (task) {
      setPersonalTaskDraft(createDefaultPersonalDraft(selectedLocation));
      setAiDraftReady(false);
      setForwardedEmail('');
    }
  }, [aiDraftReady, createPersonalTask, personalTaskDraft, selectedLocation]);

  const createTaskFromForwardedEmail = useCallback(() => {
    if (!forwardedEmail.trim()) return;
    const parsedTask = parseForwardedEmailTask(forwardedEmail, data.locations);
    setPersonalTaskDraft(parsedTask);
    setAiDraftReady(true);
    setPersonalMode(true);
    setPersonalSpaceOpen(true);
    setPersonalNotice(
      'AI draft ready. Check the title, time, location, scope, and theme before saving.',
    );
  }, [data.locations, forwardedEmail]);

  useEffect(() => {
    if (!mobile) return undefined;

    const normalizeRoute = () => {
      if (!window.location.hash || window.location.hash === '#mobile') {
        window.history.replaceState(null, '', getAppPath(getMobileHash('map')));
      }
      setMobileRoute(parseMobileRoute());
    };

    normalizeRoute();
    window.addEventListener('hashchange', normalizeRoute);
    window.addEventListener('popstate', normalizeRoute);
    return () => {
      window.removeEventListener('hashchange', normalizeRoute);
      window.removeEventListener('popstate', normalizeRoute);
    };
  }, [mobile]);

  const navigateMobile = useCallback((page, id = '', backTarget = '') => {
    if (backTarget) setMobileBackTarget(backTarget);
    window.history.pushState(null, '', getAppPath(getMobileHash(page, id)));
    setMobileRoute(parseMobileRoute());
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAgentSearch({ status: 'parsing', source: 'local', intent: localSearchIntent });
      try {
        const response = await fetch('/api/agent-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            query: trimmedQuery,
            language,
            now: new Date(now).toISOString(),
            context: {
              eventTypes: EVENT_TYPES.map((type) => ({ id: type.id, label: type.label })),
              studentLenses: STUDENT_LENSES.map((lens) => ({ id: lens.id, label: lens.label })),
              buildings: data.locations.map((location) => ({
                id: location.id,
                buildingId: location.buildingId,
                buildingName: location.buildingName,
                floor: location.floor,
                room: location.room,
                area: location.area,
              })),
            },
          }),
        });
        const payload = await response.json();
        if (!controller.signal.aborted) {
          setAgentSearch({
            status: payload.ok ? 'ready' : 'fallback',
            source: payload.source || 'local',
            model: payload.model,
            reason: payload.reason,
            error: payload.error,
            intent: payload.intent || localSearchIntent,
          });
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          setAgentSearch({
            status: 'fallback',
            source: 'local',
            error: error instanceof Error ? error.message : 'Agent search unavailable',
            intent: localSearchIntent,
          });
        }
      }
    }, 520);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [data.locations, language, localSearchIntent, now, query]);

  const handleLocationSnapshot = useCallback((snapshot) => {
    setLocationSnapshot((previous) => {
      if (
        previous &&
        previous.point?.x === snapshot.point?.x &&
        previous.point?.y === snapshot.point?.y &&
        previous.source === snapshot.source &&
        previous.geoStatus === snapshot.geoStatus &&
        previous.label === snapshot.label
      ) {
        return previous;
      }
      return snapshot;
    });
  }, []);
  const searchIntentSummary =
    (agentSearch.intent?.query === query && (language === 'zh' ? agentSearch.intent.explanationZh : agentSearch.intent.explanationEn)) ||
    summarizeSearchIntent(effectiveSearchIntent, language);
  const searchSourceLabel =
    agentSearch.status === 'parsing'
      ? language === 'zh'
        ? 'Agent \u6b63\u5728\u7406\u89e3'
        : 'Agent parsing'
      : agentSearch.source === 'openai'
        ? language === 'zh'
          ? 'OpenAI Agent'
          : 'OpenAI Agent'
        : language === 'zh'
          ? '\u672c\u5730\u515c\u5e95'
          : 'Local fallback';
  const nextOpenPersonalTask = filteredPersonalTasks[0] || openPersonalTasks[0] || null;

  const openPersonalTaskList = () => {
    setPersonalMode(true);
    setPersonalSpaceOpen(true);
    setSelectedEventId(null);
    if (nextOpenPersonalTask) {
      setSelectedPersonalTaskId(nextOpenPersonalTask.id);
      if (nextOpenPersonalTask.locationId) setSelectedLocationId(nextOpenPersonalTask.locationId);
      setSheetMode('half');
      setDetailPanelOpen(true);
      return;
    }
    setPersonalNotice(
      language === 'zh'
        ? '\u8fd8\u6ca1\u6709\u4e2a\u4eba\u4e8b\u9879\u3002\u53ef\u4ee5\u7c98\u8d34\u90ae\u4ef6\u6216\u624b\u52a8\u6dfb\u52a0\u3002'
        : 'No personal events yet. Paste an email or add one manually.',
    );
  };

  const openPersonalizedPublicEvent = (events, emptyNotice) => {
    const event = events[0];
    setPersonalMode(true);
    setSelectedPersonalTaskId(null);
    if (event) {
      setSelectedEventId(event.id);
      setSelectedLocationId(event.locationId);
      setSheetMode('half');
      setDetailPanelOpen(true);
      return;
    }
    setPersonalNotice(emptyNotice);
    setPersonalSpaceOpen(true);
  };

  const openMobileEvent = useCallback(
    (eventOrId, backTarget = 'events') => {
      const eventId = typeof eventOrId === 'string' ? eventOrId : eventOrId?.id;
      if (!eventId) return;
      const event = publishedEvents.find((item) => item.id === eventId) || visibleEvents.find((item) => item.id === eventId);
      if (event) setSelectedLocationId(event.locationId);
      setSelectedEventId(eventId);
      setSelectedPersonalTaskId(null);
      navigateMobile('event', eventId, backTarget);
    },
    [navigateMobile, publishedEvents, visibleEvents],
  );

  const openMobilePlace = useCallback(
    (locationId, backTarget = 'map') => {
      if (!locationId) return;
      setSelectedLocationId(locationId);
      setSelectedEventId(null);
      setSelectedPersonalTaskId(null);
      navigateMobile('place', locationId, backTarget);
    },
    [navigateMobile],
  );

  const openMobileTask = useCallback(
    (taskId, backTarget = 'personal') => {
      const task = personalTasks.find((item) => item.id === taskId);
      if (task?.locationId) setSelectedLocationId(task.locationId);
      setSelectedPersonalTaskId(taskId);
      setSelectedEventId(null);
      setPersonalMode(true);
      navigateMobile('task', taskId, backTarget);
    },
    [navigateMobile, personalTasks],
  );

  const openMobileMapFocus = useCallback(
    (locationId = selectedLocationId) => {
      if (locationId) setSelectedLocationId(locationId);
      setSelectedEventId(null);
      setSelectedPersonalTaskId(null);
      navigateMobile('map');
    },
    [navigateMobile, selectedLocationId],
  );

  const typeFilterLabel = typeFilter === 'all' ? (language === 'zh' ? '\u5168\u90e8\u4e3b\u9898' : 'All themes') : getEventType(typeFilter).label;
  const mobileFilterSummary = `${getTimeFilterLabel(timeFilter, language)} / ${getScopeLabel(lensFilter, language, true)} / ${typeFilterLabel}`;
  const renderFilterStack = (className = 'student-filter-stack') => (
    <section className={className}>
      <div className="time-strip" aria-label="Time filters">
        {TIME_FILTERS.map((filter) => (
          <button
            key={filter.id}
            className={timeFilter === filter.id ? 'active' : ''}
            onClick={() => setTimeFilter(filter.id)}
          >
            <Clock size={14} />
            <span>{language === 'zh' ? filter.labelZh : filter.label}</span>
            <b>{timeCounts.get(filter.id) || 0}</b>
          </button>
        ))}
      </div>
      <div className="student-tools">
        <div className="smart-search">
          <label className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} />
          </label>
          {query.trim() && (
            <div className={`agent-search-status ${agentSearch.status}`}>
              <span>{searchSourceLabel}</span>
              <strong>{searchIntentSummary || (language === 'zh' ? '\u6309\u5173\u952e\u8bcd\u641c\u7d22' : 'Keyword search')}</strong>
            </div>
          )}
        </div>
        <div className="lens-strip" aria-label="College and school-wide filters">
          {STUDENT_LENSES.map((lens) => (
            <button
              key={lens.id}
              className={lensFilter === lens.id ? 'active' : ''}
              onClick={() => setLensFilter(lens.id)}
              title={language === 'zh' ? lens.labelZh : lens.label}
            >
              <span>{language === 'zh' ? lens.shortLabelZh || lens.labelZh : lens.shortLabel}</span>
              <b>{lensCounts.get(lens.id) || 0}</b>
            </button>
          ))}
        </div>
        <div className="theme-dock" aria-label="Theme filters">
          <button
            className={typeFilter === 'all' ? 'active' : ''}
            onClick={() => setTypeFilter('all')}
            title="All themes"
            aria-label="All themes"
          >
            <Sparkles size={16} />
            <span>{language === 'zh' ? '\u5168\u90e8\u4e3b\u9898' : 'All themes'}</span>
          </button>
          {EVENT_TYPES.map((type) => (
            <button
              key={type.id}
              className={typeFilter === type.id ? 'active' : ''}
              onClick={() => setTypeFilter(type.id)}
              title={type.label}
              aria-label={type.label}
              style={{ '--type-color': type.color }}
            >
              <EventTypeIcon typeId={type.id} size={16} />
              <span>{type.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );

  const recommendationRail = (
    <RecommendationRail
      events={publishedEvents}
      stacks={allStudentStacks}
      locationsById={locationsById}
      lensFilter={lensFilter}
      locationSnapshot={locationSnapshot}
      now={now}
      language={language}
      t={t}
      onSelectEvent={(event) => {
        if (mobile) {
          openMobileEvent(event, mobileRoute.page === 'map' ? 'map' : 'events');
          return;
        }
        setSelectedEventId(event.id);
        setSelectedLocationId(event.locationId);
        setSelectedPersonalTaskId(null);
        setSheetMode('half');
        setDetailPanelOpen(true);
      }}
      onSelectLocation={(locationId) => {
        if (mobile) {
          openMobilePlace(locationId, mobileRoute.page === 'map' ? 'map' : 'events');
          return;
        }
        setSelectedLocationId(locationId);
        setSelectedEventId(null);
        setSelectedPersonalTaskId(null);
        setSheetMode('half');
        setDetailPanelOpen(true);
      }}
      onTimeFilter={setTimeFilter}
    />
  );

  const mobileActivePage = ['event', 'place', 'task'].includes(mobileRoute.page) ? mobileBackTarget : mobileRoute.page;
  const mobileRouteEvent =
    mobileRoute.page === 'event'
      ? publishedEvents.find((event) => event.id === mobileRoute.id) || visibleEvents.find((event) => event.id === mobileRoute.id) || null
      : null;
  const mobileRouteTask = mobileRoute.page === 'task' ? personalTasks.find((task) => task.id === mobileRoute.id) || null : null;
  const mobileRouteLocation =
    mobileRoute.page === 'place'
      ? locationsById.get(mobileRoute.id) || null
      : mobileRouteEvent
        ? locationsById.get(mobileRouteEvent.locationId) || null
        : mobileRouteTask?.locationId
          ? locationsById.get(mobileRouteTask.locationId) || null
          : null;
  const mobileRouteStack =
    mobileRouteLocation && mobileRoute.page === 'place'
      ? stacks.find((stack) => stack.location.id === mobileRouteLocation.id) ||
        allStudentStacks.find((stack) => stack.location.id === mobileRouteLocation.id) || { location: mobileRouteLocation, events: [] }
      : null;
  const mobileRoutePersonalTasks = mobileRouteLocation
    ? visiblePersonalTasks.filter((task) => task.locationId === mobileRouteLocation.id)
    : [];

  const renderMobileHeader = ({ title, subtitle, backTarget = '' }) => (
    <header className="mobile-app-header">
      <div className="mobile-title-row">
        {backTarget && (
          <button className="mobile-icon-button" type="button" onClick={() => navigateMobile(backTarget)}>
            <ArrowLeft size={18} />
          </button>
        )}
        <span>
          <small>{subtitle || t('campus')}</small>
          <strong>{title}</strong>
        </span>
      </div>
      <div className="mobile-header-actions">
        <button type="button" onClick={() => setLanguage((value) => (value === 'en' ? 'zh' : 'en'))}>
          {language === 'en' ? 'CN' : 'EN'}
        </button>
        <a href={getAppPath()} aria-label="Open desktop map">
          <Maximize2 size={16} />
        </a>
        <a href={getAppPath('#admin')} target="_blank" rel="noreferrer" aria-label={t('admin')}>
          <ShieldCheck size={16} />
        </a>
      </div>
    </header>
  );

  const renderMobileSearchControls = () => (
    <section className="mobile-control-panel" aria-label="Search and filters">
      <label className="search-box mobile-search-box">
        <Search size={17} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} />
      </label>
      {query.trim() && (
        <div className={`agent-search-status ${agentSearch.status}`}>
          <span>{searchSourceLabel}</span>
          <strong>{searchIntentSummary || (language === 'zh' ? '\u6309\u5173\u952e\u8bcd\u641c\u7d22' : 'Keyword search')}</strong>
        </div>
      )}
      <button className="mobile-filter-button" type="button" onClick={() => setMobileFiltersOpen(true)}>
        <Palette size={17} />
        <span>{language === 'zh' ? '\u7b5b\u9009' : 'Filters'}</span>
        <small>{mobileFilterSummary}</small>
      </button>
    </section>
  );

  const renderMobileFilterOverlay = () =>
    mobileFiltersOpen && (
      <div className="mobile-filter-overlay" role="presentation" onClick={() => setMobileFiltersOpen(false)}>
        <section className="mobile-filter-sheet" aria-label="Mobile filters" onClick={(event) => event.stopPropagation()}>
          <div className="mobile-sheet-head">
            <span>
              <Palette size={17} />
              {language === 'zh' ? '\u5730\u56fe\u7b5b\u9009' : 'Map filters'}
            </span>
            <button type="button" onClick={() => setMobileFiltersOpen(false)} aria-label="Close filters">
              <X size={17} />
            </button>
          </div>
          {renderFilterStack('student-filter-stack mobile-filter-stack')}
          <button className="primary-button mobile-filter-done" type="button" onClick={() => setMobileFiltersOpen(false)}>
            {language === 'zh' ? '\u5b8c\u6210' : 'Done'}
          </button>
        </section>
      </div>
    );

  const renderMobileBottomNav = () => {
    const items = [
      { page: 'map', label: language === 'zh' ? '\u5730\u56fe' : 'Map', icon: <MapPin size={18} /> },
      { page: 'events', label: language === 'zh' ? '\u6d3b\u52a8' : 'Events', icon: <CalendarDays size={18} /> },
      { page: 'personal', label: language === 'zh' ? '\u4e2a\u4eba' : 'Personal', icon: <ClipboardCheck size={18} /> },
      { page: 'agent', label: language === 'zh' ? '\u52a9\u624b' : 'Agent', icon: <Bot size={18} /> },
    ];

    return (
      <nav className="mobile-bottom-nav" aria-label="Mobile sections">
        {items.map((item) => (
          <a
            key={item.page}
            href={getAppPath(getMobileHash(item.page))}
            className={mobileActivePage === item.page ? 'active' : ''}
            onClick={(event) => {
              event.preventDefault();
              navigateMobile(item.page);
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
    );
  };

  const renderMobileEventCard = (event) => {
    const location = locationsById.get(event.locationId);
    const status = getEventStatus(event, now, language);
    const personalState = getPersonalEventState(event, personalMeta);
    return (
      <button key={event.id} className="mobile-list-card" type="button" onClick={() => openMobileEvent(event, 'events')}>
        <span className="mobile-list-card-head">
          <TypePill typeId={event.type} />
          <em className={`event-status ${status.tone}`}>{status.label}</em>
        </span>
        <strong>{event.title}</strong>
        <small>{formatEventTime(event)}</small>
        <small>{getLocationLabel(location)} / {event.organizer || 'Organizer not set'}</small>
        {personalMode && (personalState.reminded || personalState.checked) && (
          <span className="mobile-personal-flags">
            {personalState.reminded && <b>Reminder</b>}
            {personalState.checked && <b>Checked in</b>}
          </span>
        )}
      </button>
    );
  };

  if (mobile) {
    const mobileShellClass = `mobile-app-shell ${personalMode ? 'personal-mode' : ''}`;

    if (mobileRoute.page === 'event') {
      return (
        <main className={mobileShellClass}>
          {renderMobileHeader({
            title: mobileRouteEvent?.title || (language === 'zh' ? '\u6d3b\u52a8\u8be6\u60c5' : 'Event detail'),
            subtitle: language === 'zh' ? '\u6d3b\u52a8' : 'Event',
            backTarget: mobileBackTarget || 'events',
          })}
          <section className="mobile-detail-screen">
            {mobileRouteEvent ? (
              <>
                <div className="mobile-detail-actions">
                  <button type="button" onClick={() => openMobilePlace(mobileRouteEvent.locationId, 'event')}>
                    <MapPin size={16} />
                    {language === 'zh' ? '\u67e5\u770b\u5730\u70b9' : 'View place'}
                  </button>
                  <button type="button" onClick={() => openMobileMapFocus(mobileRouteEvent.locationId)}>
                    <Navigation size={16} />
                    {language === 'zh' ? '\u5730\u56fe\u5b9a\u4f4d' : 'View on map'}
                  </button>
                </div>
                <EventDetail
                  event={mobileRouteEvent}
                  location={locationsById.get(mobileRouteEvent.locationId)}
                  locationSnapshot={locationSnapshot}
                  updatedLabel={updatedLabel}
                  now={now}
                  language={language}
                  t={t}
                  personalMode={personalMode}
                  personalMeta={personalMeta}
                  onToggleEventReminder={toggleEventReminder}
                  onToggleEventCheckin={toggleEventCheckin}
                  onUpdateEventFeedback={updateEventFeedback}
                  onBack={() => openMobilePlace(mobileRouteEvent.locationId, 'event')}
                />
              </>
            ) : (
              <EmptyPanel t={t} />
            )}
          </section>
          {renderMobileBottomNav()}
        </main>
      );
    }

    if (mobileRoute.page === 'place') {
      return (
        <main className={mobileShellClass}>
          {renderMobileHeader({
            title: mobileRouteLocation ? getLocationLabel(mobileRouteLocation) : t('place'),
            subtitle: language === 'zh' ? '\u5730\u70b9' : 'Place',
            backTarget: mobileBackTarget || 'map',
          })}
          <section className="mobile-detail-screen">
            {mobileRouteStack ? (
              <>
                <div className="mobile-detail-actions">
                  <button type="button" onClick={() => openMobileMapFocus(mobileRouteLocation.id)}>
                    <Navigation size={16} />
                    {language === 'zh' ? '\u5730\u56fe\u5b9a\u4f4d' : 'View on map'}
                  </button>
                </div>
                <LocationStackDetail
                  stack={mobileRouteStack}
                  personalTasks={mobileRoutePersonalTasks}
                  selectedPersonalTaskId={selectedPersonalTaskId}
                  locationSnapshot={locationSnapshot}
                  updatedLabel={updatedLabel}
                  now={now}
                  language={language}
                  t={t}
                  personalMode={personalMode}
                  personalMeta={personalMeta}
                  onSelectEvent={(eventId) => openMobileEvent(eventId, 'place')}
                  onToggleEventReminder={toggleEventReminder}
                  onToggleEventCheckin={toggleEventCheckin}
                  onUpdateEventFeedback={updateEventFeedback}
                  onSelectPersonalTask={(task) => openMobileTask(task.id, 'place')}
                  onTogglePersonalTask={(task) => updatePersonalTask(task.id, { completed: !task.completed })}
                />
              </>
            ) : (
              <EmptyPanel t={t} />
            )}
          </section>
          {renderMobileBottomNav()}
        </main>
      );
    }

    if (mobileRoute.page === 'task') {
      return (
        <main className={mobileShellClass}>
          {renderMobileHeader({
            title: mobileRouteTask?.title || (language === 'zh' ? '\u4e2a\u4eba\u4e8b\u9879' : 'Personal event'),
            subtitle: 'Personal Space',
            backTarget: mobileBackTarget || 'personal',
          })}
          <section className="mobile-detail-screen">
            {mobileRouteTask ? (
              <>
                <div className="mobile-detail-actions">
                  <button type="button" onClick={() => openMobileMapFocus(mobileRouteTask.locationId)}>
                    <Navigation size={16} />
                    {language === 'zh' ? '\u5730\u56fe\u5b9a\u4f4d' : 'View on map'}
                  </button>
                </div>
                <PersonalTaskDetail
                  task={mobileRouteTask}
                  location={locationsById.get(mobileRouteTask.locationId)}
                  now={now}
                  onToggle={() => updatePersonalTask(mobileRouteTask.id, { completed: !mobileRouteTask.completed })}
                  onDelete={() => {
                    deletePersonalTask(mobileRouteTask.id);
                    navigateMobile('personal');
                  }}
                />
              </>
            ) : (
              <EmptyPanel t={t} />
            )}
          </section>
          {renderMobileBottomNav()}
        </main>
      );
    }

    if (mobileRoute.page === 'events') {
      return (
        <main className={mobileShellClass}>
          {renderMobileHeader({
            title: language === 'zh' ? '\u6d3b\u52a8' : 'Events',
            subtitle: `${visibleEvents.length} ${language === 'zh' ? '\u4e2a\u53ef\u89c1\u6d3b\u52a8' : 'visible events'}`,
          })}
          {renderMobileSearchControls()}
          {renderMobileFilterOverlay()}
          {recommendationRail}
          <section className="mobile-section">
            <div className="mobile-section-head">
              <strong>{language === 'zh' ? '\u6d3b\u52a8\u5217\u8868' : 'Event list'}</strong>
              <span>{mobileFilterSummary}</span>
            </div>
            {visibleEvents.length > 0 ? <div className="mobile-list-stack">{visibleEvents.map(renderMobileEventCard)}</div> : <EmptyPanel t={t} />}
          </section>
          {renderMobileBottomNav()}
        </main>
      );
    }

    if (mobileRoute.page === 'personal') {
      return (
        <main className={mobileShellClass}>
          {renderMobileHeader({
            title: 'Personal Space',
            subtitle: `${openPersonalTasks.length} ${language === 'zh' ? '\u4e2a\u5f85\u529e\u4e8b\u9879' : 'open personal events'}`,
          })}
          <PersonalSpaceDrawer
            open
            embedded
            showClose={false}
            showSelectedDetail={false}
            onClose={() => navigateMobile('map')}
            tasks={personalTasks}
            visibleTaskCount={visiblePersonalTasks.length}
            selectedTask={selectedPersonalTask}
            selectedTaskId={selectedPersonalTaskId}
            locations={data.locations}
            taskDraft={personalTaskDraft}
            setTaskDraft={setPersonalTaskDraft}
            forwardedEmail={forwardedEmail}
            setForwardedEmail={setForwardedEmail}
            notice={personalNotice}
            now={now}
            personalMode={personalMode}
            aiDraftReady={aiDraftReady}
            remindedEventCount={remindedEventCount}
            checkedEventCount={checkedEventCount}
            onEnterPersonalMode={() => setPersonalMode(true)}
            onExitPersonalMode={() => {
              setPersonalMode(false);
              setSelectedPersonalTaskId(null);
            }}
            onCreateTask={submitPersonalTaskDraft}
            onCreateFromEmail={createTaskFromForwardedEmail}
            onSelectTask={(task) => openMobileTask(task.id, 'personal')}
            onToggleTask={(task) => updatePersonalTask(task.id, { completed: !task.completed })}
            onDeleteTask={(task) => deletePersonalTask(task.id)}
          />
          {renderMobileBottomNav()}
        </main>
      );
    }

    if (mobileRoute.page === 'agent') {
      return (
        <main className={mobileShellClass}>
          {renderMobileHeader({
            title: 'SMART Agent',
            subtitle: language === 'zh' ? '\u6821\u56ed\u52a9\u624b' : 'Campus assistant',
          })}
          <CampusAgentWidget
            open
            embedded
            showClose={false}
            onClose={() => navigateMobile('map')}
            visibleEvents={visibleEvents}
            stacks={stacks}
            selectedStack={selectedStack}
            selectedEvent={selectedEvent}
            locationsById={locationsById}
            lensFilter={lensFilter}
            setLensFilter={setLensFilter}
            setTimeFilter={setTimeFilter}
            setSelectedLocationId={(locationId) => openMobilePlace(locationId, 'agent')}
            setSelectedEventId={(eventId) => openMobileEvent(eventId, 'agent')}
            personalId={personalId}
            personalTasks={personalTasks}
            locations={data.locations}
            onCreatePersonalTask={(draft) => {
              const task = createPersonalTask(draft);
              if (task) navigateMobile('personal');
              return task;
            }}
            onSelectPersonalTask={(taskId) => openMobileTask(taskId, 'agent')}
            locationSnapshot={locationSnapshot}
            now={now}
            language={language}
            t={t}
          />
          {renderMobileBottomNav()}
        </main>
      );
    }

    return (
      <main className={mobileShellClass}>
        {renderMobileHeader({
          title: language === 'zh' ? '\u5730\u56fe' : 'Map',
          subtitle: `${stacks.length} ${language === 'zh' ? '\u4e2a\u5730\u70b9' : 'places'}`,
        })}
        {renderMobileSearchControls()}
        {renderMobileFilterOverlay()}
        {personalMode && (
          <section className="mobile-personal-strip">
            <span>
              <ClipboardCheck size={16} />
              {language === 'zh' ? '\u4e2a\u4eba\u56fe\u5c42\u5df2\u5f00\u542f' : 'Personal layer on'}
            </span>
            <button type="button" onClick={() => navigateMobile('personal')}>
              {openPersonalTasks.length} {language === 'zh' ? '\u4e2a\u4eba\u4e8b\u9879' : 'personal'}
            </button>
          </section>
        )}
        <section className="mobile-map-card" aria-label="Campus map">
          <CampusMap
            stacks={stacks}
            locations={data.locations}
            personalTasks={visiblePersonalTasks}
            personalMode={personalMode}
            personalMeta={personalMeta}
            selectedLocationId={selectedLocation?.id}
            selectedEventId={selectedEventId}
            selectedPersonalTaskId={selectedPersonalTaskId}
            onLocationSnapshot={handleLocationSnapshot}
            language={language}
            t={t}
            onSelectLocation={(locationId) => openMobilePlace(locationId, 'map')}
            onSelectPersonalTask={(taskId, locationId) => {
              setPersonalMode(true);
              setSelectedLocationId(locationId);
              openMobileTask(taskId, 'map');
            }}
            onMovePersonalTask={(taskId, mapPoint) => {
              updatePersonalTask(taskId, { mapPoint, locationId: '' });
              setSelectedPersonalTaskId(taskId);
            }}
          />
        </section>
        <section className="mobile-map-summary">
          <button type="button" onClick={() => navigateMobile('events')}>
            <CalendarDays size={16} />
            <span>
              <strong>{visibleEvents.length}</strong>
              {language === 'zh' ? '\u4e2a\u53ef\u89c1\u6d3b\u52a8' : 'visible events'}
            </span>
          </button>
          <button type="button" onClick={() => navigateMobile('agent')}>
            <Bot size={16} />
            <span>{language === 'zh' ? '\u8be2\u95ee Agent' : 'Ask Agent'}</span>
          </button>
        </section>
        {renderMobileBottomNav()}
      </main>
    );
  }

  return (
    <main className={`student-shell ${mobile ? 'mobile-shell' : ''} ${personalMode ? 'personal-mode' : ''}`}>
      <header className="student-topbar">
        <div>
          <span className="eyebrow">{t('campus')}</span>
          <h1>{t('title')}</h1>
        </div>
        <div className="student-top-actions">
          <button
            className={`top-action personal-space-toggle ${personalMode ? 'active' : ''}`}
            onClick={() => {
              setPersonalMode(true);
              setPersonalSpaceOpen(true);
            }}
            title="Enter Personal Space mode"
            aria-label="Enter Personal Space mode"
          >
            <ClipboardCheck size={17} />
            <span className="top-action-label">{mobile ? 'Personal' : 'Personal Space'}</span>
            {openPersonalTasks.length > 0 && <b>{openPersonalTasks.length}</b>}
          </button>
          <button
            className="top-action language-toggle"
            onClick={() => setLanguage((value) => (value === 'en' ? 'zh' : 'en'))}
            title="Switch language"
            aria-label="Switch language"
          >
            <span className="top-action-main">{language === 'en' ? 'CN' : 'EN'}</span>
            <span className="top-action-label">{mobile ? 'Lang' : 'Language'}</span>
          </button>
          <button
            className="top-action agent-dialog-toggle"
            onClick={() => setAgentDialogOpen(true)}
            title="Open SMART Agent"
            aria-label="Open SMART Agent"
          >
            <Bot size={17} />
            <span className="top-action-label">{mobile ? 'Agent' : 'SMART Agent'}</span>
          </button>
          <a className="top-action admin-link compact" href={getAppPath('#admin')} target="_blank" rel="noreferrer" title={t('admin')} aria-label={t('admin')}>
            <ShieldCheck size={17} />
            <span className="top-action-label">Admin</span>
          </a>
          {mobile ? (
            <a className="top-action mobile-entry-link" href={getAppPath()} title="Open desktop map" aria-label="Open desktop map">
              <Maximize2 size={17} />
              <span className="top-action-label">Desktop</span>
            </a>
          ) : (
            <a className="top-action mobile-entry-link" href={getAppPath('mobile')} title="Open mobile map" aria-label="Open mobile map">
              <MapPin size={17} />
              <span className="top-action-label">Mobile</span>
            </a>
          )}
        </div>
      </header>

      {!mobile && renderFilterStack()}

      {mobile && (
        <section className="mobile-map-toolbar" aria-label="Mobile map controls">
          <label className="search-box mobile-search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} />
          </label>
          {query.trim() && (
            <div className={`agent-search-status ${agentSearch.status}`}>
              <span>{searchSourceLabel}</span>
              <strong>{searchIntentSummary || (language === 'zh' ? '\u6309\u5173\u952e\u8bcd\u641c\u7d22' : 'Keyword search')}</strong>
            </div>
          )}
          <button className="mobile-filter-button" type="button" onClick={() => setMobileFiltersOpen(true)}>
            <Palette size={17} />
            <span>{language === 'zh' ? '\u7b5b\u9009' : 'Filters'}</span>
            <small>{mobileFilterSummary}</small>
          </button>
        </section>
      )}

      {mobile && mobileFiltersOpen && (
        <div className="mobile-filter-overlay" role="presentation" onClick={() => setMobileFiltersOpen(false)}>
          <section className="mobile-filter-sheet" aria-label="Mobile filters" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-sheet-head">
              <span>
                <Palette size={17} />
                {language === 'zh' ? '\u5730\u56fe\u7b5b\u9009' : 'Map filters'}
              </span>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} aria-label="Close filters">
                <X size={17} />
              </button>
            </div>
            {renderFilterStack('student-filter-stack mobile-filter-stack')}
            <button className="primary-button mobile-filter-done" type="button" onClick={() => setMobileFiltersOpen(false)}>
              {language === 'zh' ? '\u5b8c\u6210' : 'Done'}
            </button>
          </section>
        </div>
      )}

      {personalMode && (
        <section className="personal-mode-banner" aria-label="Personal Space actions">
          <button
            type="button"
            className="personal-mode-chip personal-mode-title"
            onClick={() => setPersonalSpaceOpen(true)}
            title="Open Personal Space settings"
          >
            <ClipboardCheck size={17} />
            <span>
              <strong>Personal Space</strong>
              <small>{language === 'zh' ? '\u4e2a\u4eba\u56fe\u5c42\u5df2\u5f00\u542f' : 'Private layer on'}</small>
            </span>
          </button>
          <button
            type="button"
            className="personal-mode-chip personal-mode-stat"
            onClick={openPersonalTaskList}
            title="Open personal events"
          >
            <strong>{openPersonalTasks.length}</strong>
            <span>{language === 'zh' ? '\u4e2a\u4eba\u4e8b\u9879' : `personal event${openPersonalTasks.length === 1 ? '' : 's'}`}</span>
          </button>
          <button
            type="button"
            className="personal-mode-chip personal-mode-stat"
            onClick={() =>
              openPersonalizedPublicEvent(
                remindedPublicEvents,
                language === 'zh'
                  ? '\u8fd8\u6ca1\u6709\u516c\u5171\u63d0\u9192\u3002\u6253\u5f00\u6d3b\u52a8\u8be6\u60c5\u540e\u53ef\u4ee5\u70b9 Remind me\u3002'
                  : 'No public reminders yet. Open a public event and tap Remind me.',
              )
            }
            title="Open public reminders"
          >
            <strong>{remindedEventCount}</strong>
            <span>{language === 'zh' ? '\u516c\u5171\u63d0\u9192' : `public reminder${remindedEventCount === 1 ? '' : 's'}`}</span>
          </button>
          <button
            type="button"
            className="personal-mode-chip personal-mode-stat"
            onClick={() =>
              openPersonalizedPublicEvent(
                checkedPublicEvents,
                language === 'zh'
                  ? '\u8fd8\u6ca1\u6709\u6253\u5361\u53cd\u9988\u3002\u6253\u5f00\u6d3b\u52a8\u8be6\u60c5\u540e\u53ef\u4ee5\u6253\u5361\u3002'
                  : 'No check-ins yet. Open an event detail to check in.',
              )
            }
            title="Open check-ins"
          >
            <strong>{checkedEventCount}</strong>
            <span>{language === 'zh' ? '\u6253\u5361\u53cd\u9988' : `check-in${checkedEventCount === 1 ? '' : 's'}`}</span>
          </button>
          <button className="personal-mode-chip settings" type="button" onClick={() => setPersonalSpaceOpen(true)}>
            {language === 'zh' ? '\u8bbe\u7f6e' : 'Settings'}
          </button>
          <button
            className="personal-mode-chip exit"
            type="button"
            onClick={() => {
              setPersonalMode(false);
              setSelectedPersonalTaskId(null);
            }}
          >
            {language === 'zh' ? '\u9000\u51fa' : 'Exit'}
          </button>
        </section>
      )}

      {!mobile && recommendationRail}

      <section className={`student-layout ${detailPanelOpen ? '' : 'details-collapsed'}`}>
        <div className="map-stage">
          <button
            className={`detail-panel-toggle ${detailPanelOpen ? 'active' : ''}`}
            type="button"
            onClick={() => setDetailPanelOpen((value) => !value)}
            title={detailPanelOpen ? 'Hide details' : 'Show details'}
          >
            {detailPanelOpen ? <X size={15} /> : <MapPin size={15} />}
            <span>{language === 'zh' ? (detailPanelOpen ? '\u9690\u85cf\u8be6\u60c5' : '\u663e\u793a\u8be6\u60c5') : detailPanelOpen ? 'Hide details' : 'Details'}</span>
          </button>
          <CampusMap
            stacks={stacks}
            locations={data.locations}
            personalTasks={visiblePersonalTasks}
            personalMode={personalMode}
            personalMeta={personalMeta}
            selectedLocationId={selectedLocation?.id}
            selectedEventId={selectedEventId}
            selectedPersonalTaskId={selectedPersonalTaskId}
            onLocationSnapshot={handleLocationSnapshot}
            language={language}
            t={t}
            onSelectLocation={(locationId) => {
              setSelectedLocationId(locationId);
              setSelectedEventId(null);
              setSelectedPersonalTaskId(null);
              setSheetMode('half');
              setDetailPanelOpen(true);
            }}
            onSelectPersonalTask={(taskId, locationId) => {
              setPersonalMode(true);
              setSelectedPersonalTaskId(taskId);
              setSelectedEventId(null);
              setSelectedLocationId(locationId);
              setSheetMode('half');
              setDetailPanelOpen(true);
            }}
            onMovePersonalTask={(taskId, mapPoint) => {
              updatePersonalTask(taskId, { mapPoint, locationId: '' });
              setSelectedPersonalTaskId(taskId);
              setDetailPanelOpen(true);
            }}
          />
        </div>

        {detailPanelOpen && (
          <aside className={`student-panel sheet-${sheetMode}`}>
          <div className="sheet-controls">
            <button className={sheetMode === 'peek' ? 'active' : ''} onClick={() => setSheetMode('peek')}>
              {language === 'zh' ? '\u6536\u8d77' : 'Peek'}
            </button>
            <button className={sheetMode === 'half' ? 'active' : ''} onClick={() => setSheetMode('half')}>
              {language === 'zh' ? '\u534a\u5c4f' : 'Half'}
            </button>
            <button className={sheetMode === 'full' ? 'active' : ''} onClick={() => setSheetMode('full')}>
              {language === 'zh' ? '\u5168\u5c4f' : 'Full'}
            </button>
          </div>
          {personalMode && selectedPersonalTask ? (
            <PersonalTaskDetail
              task={selectedPersonalTask}
              location={locationsById.get(selectedPersonalTask.locationId)}
              now={now}
              onToggle={() => updatePersonalTask(selectedPersonalTask.id, { completed: !selectedPersonalTask.completed })}
              onDelete={() => deletePersonalTask(selectedPersonalTask.id)}
            />
          ) : selectedEvent ? (
            <EventDetail
              event={selectedEvent}
              location={locationsById.get(selectedEvent.locationId)}
              locationSnapshot={locationSnapshot}
              updatedLabel={updatedLabel}
              now={now}
              language={language}
              t={t}
              personalMode={personalMode}
              personalMeta={personalMeta}
              onToggleEventReminder={toggleEventReminder}
              onToggleEventCheckin={toggleEventCheckin}
              onUpdateEventFeedback={updateEventFeedback}
              onBack={() => setSelectedEventId(null)}
            />
          ) : selectedStack || selectedLocationPersonalTasks.length > 0 ? (
            <LocationStackDetail
              stack={selectedStack || { location: selectedLocation, events: [] }}
              personalTasks={selectedLocationPersonalTasks}
              selectedPersonalTaskId={selectedPersonalTaskId}
              locationSnapshot={locationSnapshot}
              updatedLabel={updatedLabel}
              now={now}
              language={language}
              t={t}
              personalMode={personalMode}
              personalMeta={personalMeta}
              onSelectEvent={(eventId) => {
                setSelectedEventId(eventId);
                setSelectedPersonalTaskId(null);
                setDetailPanelOpen(true);
              }}
              onToggleEventReminder={toggleEventReminder}
              onToggleEventCheckin={toggleEventCheckin}
              onUpdateEventFeedback={updateEventFeedback}
              onSelectPersonalTask={(task) => {
                setPersonalMode(true);
                setSelectedPersonalTaskId(task.id);
                setPersonalSpaceOpen(true);
                setDetailPanelOpen(true);
              }}
              onTogglePersonalTask={(task) => updatePersonalTask(task.id, { completed: !task.completed })}
            />
          ) : (
            <EmptyPanel t={t} />
          )}
          </aside>
        )}
      </section>

      {mobile && recommendationRail}

      <PersonalSpaceDrawer
        open={personalSpaceOpen}
        onClose={() => setPersonalSpaceOpen(false)}
        tasks={personalTasks}
        visibleTaskCount={visiblePersonalTasks.length}
        selectedTask={selectedPersonalTask}
        selectedTaskId={selectedPersonalTaskId}
        locations={data.locations}
        taskDraft={personalTaskDraft}
        setTaskDraft={setPersonalTaskDraft}
        forwardedEmail={forwardedEmail}
        setForwardedEmail={setForwardedEmail}
        notice={personalNotice}
        now={now}
        personalMode={personalMode}
        aiDraftReady={aiDraftReady}
        remindedEventCount={remindedEventCount}
        checkedEventCount={checkedEventCount}
        onEnterPersonalMode={() => setPersonalMode(true)}
        onExitPersonalMode={() => {
          setPersonalMode(false);
          setSelectedPersonalTaskId(null);
        }}
        onCreateTask={submitPersonalTaskDraft}
        onCreateFromEmail={createTaskFromForwardedEmail}
        onSelectTask={(task) => {
          setPersonalMode(true);
          setSelectedPersonalTaskId(task.id);
          setSelectedEventId(null);
          if (task.locationId) setSelectedLocationId(task.locationId);
          setDetailPanelOpen(true);
        }}
        onToggleTask={(task) => updatePersonalTask(task.id, { completed: !task.completed })}
        onDeleteTask={(task) => deletePersonalTask(task.id)}
      />
      <CampusAgentWidget
        open={agentDialogOpen}
        onClose={() => setAgentDialogOpen(false)}
        visibleEvents={visibleEvents}
        stacks={stacks}
        selectedStack={selectedStack}
        selectedEvent={selectedEvent}
        locationsById={locationsById}
        lensFilter={lensFilter}
        setLensFilter={setLensFilter}
        setTimeFilter={setTimeFilter}
        setSelectedLocationId={(locationId) => {
          setSelectedLocationId(locationId);
          setSelectedEventId(null);
          setSelectedPersonalTaskId(null);
          setSheetMode('half');
        }}
        setSelectedEventId={(eventId) => {
          const event = publishedEvents.find((item) => item.id === eventId);
          if (event) setSelectedLocationId(event.locationId);
          setSelectedEventId(eventId);
          setSelectedPersonalTaskId(null);
          setSheetMode('half');
        }}
        personalId={personalId}
        personalTasks={personalTasks}
        locations={data.locations}
        onCreatePersonalTask={createPersonalTask}
        onSelectPersonalTask={(taskId) => {
          setPersonalMode(true);
          const task = personalTasks.find((item) => item.id === taskId);
          if (task?.locationId) setSelectedLocationId(task.locationId);
          setSelectedPersonalTaskId(taskId);
          setSelectedEventId(null);
          setSheetMode('half');
        }}
        locationSnapshot={locationSnapshot}
        now={now}
        language={language}
        t={t}
      />
    </main>
  );
}

function RecommendationRail({
  events,
  stacks,
  locationsById,
  lensFilter,
  locationSnapshot,
  now,
  language,
  t,
  onSelectEvent,
  onSelectLocation,
  onTimeFilter,
}) {
  const futureEvents = events
    .filter((event) => {
      const eventWindow = getEventWindow(event);
      return eventWindow.end == null || eventWindow.end >= now;
    })
    .sort((first, second) => new Date(first.startTime || 0) - new Date(second.startTime || 0));
  const liveEvent = futureEvents.find((event) => getEventStatus(event, now, language).tone === 'live');
  const nextEvent = liveEvent || futureEvents[0] || events[0];
  const nearestStack = stacks
    .map((stack) => ({ ...stack, distance: getMapDistance(locationSnapshot?.point, stack.location.mapPoint) ?? Infinity }))
    .sort((first, second) => first.distance - second.distance)[0];
  const lensEvent = futureEvents.find((event) => eventFitsLens(event, lensFilter)) || futureEvents[0];
  const primaryTimeFilter = getPrimaryTimeFilter(events, now);

  const cards = [
    {
      id: 'next',
      label: t('nextUp'),
      title: nextEvent?.title || t('noEvents'),
      meta: nextEvent ? `${formatEventTime(nextEvent)} / ${getEventStatus(nextEvent, now, language).label}` : t('tryFilters'),
      icon: <Clock size={16} />,
      action: () => nextEvent && onSelectEvent(nextEvent),
    },
    {
      id: 'nearest',
      label: t('nearest'),
      title: nearestStack ? getLocationLabel(nearestStack.location) : t('nearestHint'),
      meta: nearestStack
        ? `${getRouteSummary(locationSnapshot?.point, nearestStack.location, language)} / ${nearestStack.events.length} ${
            language === 'zh' ? '个活动' : 'events'
          }`
        : '',
      icon: <Navigation size={16} />,
      action: () => nearestStack && onSelectLocation(nearestStack.location.id),
    },
    {
      id: 'lens',
      label: t('majorPick'),
      title: lensEvent?.title || t('noEvents'),
      meta: lensEvent ? getLocationLabel(locationsById.get(lensEvent.locationId)) : t('tryFilters'),
      icon: <GraduationCap size={16} />,
      action: () => lensEvent && onSelectEvent(lensEvent),
    },
  ];

  return (
    <section className="recommendation-rail" aria-label="Recommended events">
      <div className="recommendation-head">
        <span className="eyebrow">{t('recommended')}</span>
        <button onClick={() => onTimeFilter(primaryTimeFilter)} disabled={events.length === 0}>
          <Clock size={15} />
          {getTimeActionLabel(primaryTimeFilter, language)}
        </button>
      </div>
      <div className="recommendation-cards">
        {cards.map((card) => (
          <button key={card.id} className="recommendation-card" onClick={card.action} disabled={!card.action}>
            <span className="recommendation-icon">{card.icon}</span>
            <span>
              <small>{card.label}</small>
              <strong>{card.title}</strong>
              {card.meta && <em>{card.meta}</em>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function CampusAgentWidget({
  open,
  onClose,
  embedded = false,
  showClose = true,
  visibleEvents,
  stacks,
  selectedStack,
  selectedEvent,
  locationsById,
  lensFilter,
  setLensFilter,
  setTimeFilter,
  setSelectedLocationId,
  setSelectedEventId,
  personalId,
  personalTasks,
  locations,
  onCreatePersonalTask,
  onSelectPersonalTask,
  locationSnapshot,
  now,
  language,
  t,
}) {
  const [mode, setMode] = useState('ask');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [askPrompt, setAskPrompt] = useState('');
  const [askStatus, setAskStatus] = useState('idle');
  const [askAnswer, setAskAnswer] = useState('');
  const [askSource, setAskSource] = useState('');
  const nextEvent = visibleEvents[0];
  const busiestStack = stacks.reduce((best, stack) => (stack.events.length > (best?.events.length || 0) ? stack : best), null);
  const selectedLocation = selectedEvent ? locationsById.get(selectedEvent.locationId) : selectedStack?.location;
  const nearestStack = stacks
    .map((stack) => ({ ...stack, distance: getMapDistance(locationSnapshot?.point, stack.location.mapPoint) ?? Infinity }))
    .sort((first, second) => first.distance - second.distance)[0];
  const unverifiedStacks = stacks.filter((stack) => !stack.location.verified);
  const missingSourceEvents = visibleEvents.filter((event) => event.official && !event.sourceUrl);
  const currentLens = getStudentLens(lensFilter);
  const primaryTimeFilter = getPrimaryTimeFilter(visibleEvents, now);
  const openPersonalTasks = personalTasks.filter((task) => !task.completed);
  const nextPersonalTask = [...openPersonalTasks].sort(
    (first, second) => new Date(first.dueTime || first.createdAt) - new Date(second.dueTime || second.createdAt),
  )[0];

  const addAgentPersonalTask = () => {
    const text = taskPrompt.trim();
    if (!text) return;
    const location = inferLocationFromText(text, locations);
    const taskLocation = location || selectedLocation;
    const task = onCreatePersonalTask({
      title: text.split(/[.\n]/)[0].slice(0, 90) || 'SMART Agent personal event',
      note: text,
      dueTime: parseEmailDueTime(text),
      locationId: taskLocation?.id || '',
      mapPoint: taskLocation?.mapPoint || { x: 74, y: 48 },
      type: inferPersonalTaskType(text),
      scopeId: inferPersonalTaskScope(text),
      source: 'agent',
      sourceText: text,
    });
    if (task) {
      setTaskPrompt('');
      setMode('personal');
    }
  };

  const buildLocalAskAnswer = (question) => {
    const normalized = question.toLowerCase();
    const keyword = normalized
      .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
      .filter((item) => item.length >= 2)
      .slice(0, 6);
    const matchedEvents = visibleEvents
      .filter((event) => {
        const haystack = [event.title, event.summary, event.organizer, event.type, getLocationLabel(locationsById.get(event.locationId))]
          .join(' ')
          .toLowerCase();
        return keyword.some((item) => haystack.includes(item));
      })
      .slice(0, 3);
    const matchedPlaces = stacks
      .filter((stack) => {
        const haystack = [getLocationLabel(stack.location), stack.location.entranceHint, stack.location.area, stack.location.buildingName]
          .join(' ')
          .toLowerCase();
        return keyword.some((item) => haystack.includes(item));
      })
      .slice(0, 2);

    if (/personal|private|mine|my|提醒|个人|私人|打卡|反馈/.test(normalized)) {
      return `Personal Space is active as a private map layer on this browser. You have ${openPersonalTasks.length} open personal event${
        openPersonalTasks.length === 1 ? '' : 's'
      }. SMART Agent can add private personal events, reminders, and check-ins, but it cannot publish public/Admin events.`;
    }

    if (/route|where|how to get|navigate|路线|怎么去|在哪/.test(normalized) && selectedLocation) {
      return `${getLocationLabel(selectedLocation)}: ${getRouteSummary(locationSnapshot?.point, selectedLocation, language)} ${
        selectedLocation.entranceHint || ''
      }`;
    }

    if (matchedEvents.length > 0) {
      return `I found ${matchedEvents.length} relevant public event${matchedEvents.length === 1 ? '' : 's'}: ${matchedEvents
        .map((event) => `${event.title} at ${getLocationLabel(locationsById.get(event.locationId))}, ${formatEventTime(event)}`)
        .join('; ')}.`;
    }

    if (matchedPlaces.length > 0) {
      return `I found relevant place${matchedPlaces.length === 1 ? '' : 's'}: ${matchedPlaces
        .map((stack) => `${getLocationLabel(stack.location)} with ${stack.events.length} visible event${stack.events.length === 1 ? '' : 's'}`)
        .join('; ')}.`;
    }

    if (nextEvent) {
      return `I can answer from the current map data. Right now there are ${visibleEvents.length} visible events. Next up is ${
        nextEvent.title
      } at ${getLocationLabel(locationsById.get(nextEvent.locationId))}.`;
    }

    return 'I can answer questions about the current map, public events, routes, and your Personal Space. I do not see a matching event in the current filters.';
  };

  const askSmartAgent = async () => {
    const question = askPrompt.trim();
    if (!question) return;
    setAskStatus('asking');
    setAskAnswer('');
    setAskSource('');

    const context = {
      selectedEvent: selectedEvent
        ? {
            title: selectedEvent.title,
            time: formatEventTime(selectedEvent),
            location: getLocationLabel(locationsById.get(selectedEvent.locationId)),
            summary: selectedEvent.summary,
          }
        : null,
      selectedPlace: selectedLocation
        ? {
            label: getLocationLabel(selectedLocation),
            route: getRouteSummary(locationSnapshot?.point, selectedLocation, language),
            guidance: selectedLocation.entranceHint,
          }
        : null,
      visibleEvents: visibleEvents.slice(0, 12).map((event) => ({
        title: event.title,
        type: getEventType(event.type).label,
        time: formatEventTime(event),
        location: getLocationLabel(locationsById.get(event.locationId)),
        summary: event.summary,
      })),
      places: stacks.slice(0, 10).map((stack) => ({
        label: getLocationLabel(stack.location),
        eventCount: stack.events.length,
        guidance: stack.location.entranceHint,
      })),
      personalSpace: {
        name: personalId || '',
        openEvents: openPersonalTasks.slice(0, 8).map((task) => ({
          title: task.title,
          due: formatPersonalTaskDue(task),
          type: getPersonalTaskTypeLabel(task.type),
          location: getLocationLabel(locationsById.get(task.locationId)),
        })),
      },
    };

    try {
      const response = await fetch('/api/agent-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          language,
          now: new Date(now).toISOString(),
          context,
        }),
      });
      const payload = await response.json();
      if (payload.answer) {
        setAskAnswer(payload.answer);
        setAskSource(payload.source === 'openai' ? 'AI answer' : 'local map answer');
        setAskStatus(payload.source === 'openai' && payload.ok !== false ? 'ready' : 'fallback');
        return;
      }
      throw new Error(payload.error || 'SMART Agent did not return an answer.');
    } catch {
      setAskAnswer(buildLocalAskAnswer(question));
      setAskSource('local map answer');
      setAskStatus('fallback');
    }
  };

  const modeButtons = [
    { id: 'ask', label: 'Ask', icon: <MessageSquareText size={15} /> },
    { id: 'brief', label: language === 'zh' ? '\u6982\u89c8' : 'Brief', icon: <Compass size={15} /> },
    { id: 'nearby', label: language === 'zh' ? '\u9644\u8fd1' : 'Near', icon: <Navigation size={15} /> },
    { id: 'major', label: language === 'zh' ? '\u8303\u56f4' : 'Scope', icon: <GraduationCap size={15} /> },
    { id: 'route', label: language === 'zh' ? '\u8def\u7ebf' : 'Route', icon: <Route size={15} /> },
    { id: 'personal', label: 'Mine', icon: <ClipboardCheck size={15} /> },
  ];

  return (
    <div className={`agent-widget ${open ? 'open' : ''} ${embedded ? 'embedded' : ''}`}>
      {(open || embedded) && (
        <section className="agent-panel" aria-label="SMART Agent">
          <div className="agent-head">
            <span>
              <Bot size={17} />
              SMART Agent
            </span>
            {showClose && (
              <button onClick={onClose} aria-label="Close SMART Agent">
                <X size={16} />
              </button>
            )}
          </div>

          <div className="agent-tabs">
            {modeButtons.map((item) => (
              <button key={item.id} className={mode === item.id ? 'active' : ''} onClick={() => setMode(item.id)}>
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="agent-answer">
            {mode === 'ask' && (
              <>
                <strong>Ask SMART Agent</strong>
                <p>
                  Ask freely about current events, places, routes, or Personal Space. SMART Agent can advise and create private events, but it cannot publish public/Admin events.
                </p>
                <textarea
                  className="agent-ask-box"
                  rows={4}
                  value={askPrompt}
                  onChange={(event) => setAskPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') askSmartAgent();
                  }}
                  placeholder="Ask anything, e.g. which career event should I attend today, how do I get to AB2002, or help me plan my Personal Space reminders."
                />
                <div className="agent-actions">
                  <button onClick={askSmartAgent} disabled={!askPrompt.trim() || askStatus === 'asking'}>
                    {askStatus === 'asking' ? 'Thinking...' : 'Ask AI'}
                  </button>
                  <button
                    onClick={() => {
                      setAskPrompt('');
                      setAskAnswer('');
                      setAskStatus('idle');
                      setAskSource('');
                    }}
                    disabled={!askPrompt && !askAnswer}
                  >
                    Clear
                  </button>
                </div>
                {askAnswer && (
                  <div className={`agent-free-answer ${askStatus}`}>
                    <span>{askSource === 'openai' ? 'AI answer' : askSource || 'SMART Agent'}</span>
                    <p>{askAnswer}</p>
                  </div>
                )}
                <small className="agent-boundary-note">
                  Free questions are private to this session. Public event edits still require the Admin console.
                </small>
              </>
            )}

            {mode === 'brief' && (
              <>
                <strong>
                  {language === 'zh'
                    ? `${stacks.length} 个地点有 ${visibleEvents.length} 个可见活动`
                    : `${visibleEvents.length} visible events at ${stacks.length} places`}
                </strong>
                {nextEvent ? (
                  <p>
                    {language === 'zh' ? '下一场：' : 'Next: '}
                    {nextEvent.title} @ {getLocationLabel(locationsById.get(nextEvent.locationId))}.{' '}
                    {getEventStatus(nextEvent, now, language).label}.
                  </p>
                ) : (
                  <p>{t('tryFilters')}</p>
                )}
                {busiestStack && (
                  <p>
                    {language === 'zh' ? '活动最多地点：' : 'Busiest place: '}
                    {getLocationLabel(busiestStack.location)} / {busiestStack.events.length}
                    {language === 'zh' ? ' 个活动' : ` event${busiestStack.events.length === 1 ? '' : 's'}`}.
                  </p>
                )}
                <div className="agent-actions">
                  <button onClick={() => setTimeFilter(primaryTimeFilter)}>{getTimeActionLabel(primaryTimeFilter, language)}</button>
                  {nextEvent && <button onClick={() => setSelectedEventId(nextEvent.id)}>{t('open')}</button>}
                </div>
              </>
            )}

            {mode === 'nearby' && (
              <>
                <strong>{nearestStack ? getLocationLabel(nearestStack.location) : t('nearestHint')}</strong>
                <p>
                  {nearestStack
                    ? `${getRouteSummary(locationSnapshot?.point, nearestStack.location, language)} ${nearestStack.events.length} ${
                        language === 'zh' ? '个可见活动在这里。' : `visible event${nearestStack.events.length === 1 ? '' : 's'} here.`
                      }`
                    : t('nearestHint')}
                </p>
                {nearestStack && (
                  <div className="agent-actions">
                    <button onClick={() => setSelectedLocationId(nearestStack.location.id)}>{t('showNearest')}</button>
                  </div>
                )}
              </>
            )}

            {mode === 'major' && (
              <>
                <strong>{language === 'zh' ? currentLens.labelZh || currentLens.label : currentLens.label}</strong>
                <p>
                  {language === 'zh'
                    ? '先按全校或学院范围筛选，再用主题按钮继续缩小结果。'
                    : 'Filter by school-wide or college scope, then narrow the map with theme buttons.'}
                </p>
                <div className="agent-lens-grid">
                  {STUDENT_LENSES.map((lens) => (
                    <button key={lens.id} className={lensFilter === lens.id ? 'active' : ''} onClick={() => setLensFilter(lens.id)}>
                      {language === 'zh' ? lens.shortLabelZh || lens.labelZh : lens.shortLabel}
                    </button>
                  ))}
                </div>
              </>
            )}

            {mode === 'route' && (
              <>
                <strong>{selectedLocation ? getLocationLabel(selectedLocation) : language === 'zh' ? '\u9009\u62e9\u4e00\u4e2a\u5730\u56fe\u70b9' : 'Select a map point'}</strong>
                <p>
                  {selectedLocation
                    ? `${getRouteSummary(locationSnapshot?.point, selectedLocation, language)} ${selectedLocation.entranceHint}`
                    : language === 'zh'
                      ? '\u70b9\u51fb\u5730\u70b9\u6807\u8bb0\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u623f\u95f4\u7ea7\u8def\u7ebf\u63d0\u793a\u3002'
                      : 'Tap a place marker to see room-level guidance here.'}
                </p>
              </>
            )}

            {mode === 'personal' && (
              <>
                <strong>{`${openPersonalTasks.length} personal events in your private layer`}</strong>
                <p>
                  {nextPersonalTask
                    ? `Next: ${nextPersonalTask.title} / ${formatPersonalTaskDue(nextPersonalTask)}.`
                    : 'Your Personal Space is ready. Add a private event from a note or forwarded email.'}
                </p>
                <textarea
                  rows={3}
                  value={taskPrompt}
                  onChange={(event) => setTaskPrompt(event.target.value)}
                  placeholder="Ask SMART Agent to add a private event, e.g. remind me to submit coursework in AB2002 on 2026-05-23 18:00"
                />
                <div className="agent-actions">
                  <button onClick={addAgentPersonalTask} disabled={!taskPrompt.trim()}>
                    Add personal event
                  </button>
                  {nextPersonalTask && <button onClick={() => onSelectPersonalTask(nextPersonalTask.id)}>Open next</button>}
                </div>
                {(unverifiedStacks.length > 0 || missingSourceEvents.length > 0) && (
                  <small className="agent-boundary-note">
                    Agent can create private tasks here, but admin/public tasks still require the Admin console.
                  </small>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function PersonalSpaceDrawer({
  open,
  onClose,
  embedded = false,
  showClose = true,
  showSelectedDetail = true,
  tasks,
  visibleTaskCount,
  selectedTask,
  selectedTaskId,
  locations,
  taskDraft,
  setTaskDraft,
  forwardedEmail,
  setForwardedEmail,
  notice,
  now,
  personalMode,
  aiDraftReady,
  remindedEventCount,
  checkedEventCount,
  onEnterPersonalMode,
  onExitPersonalMode,
  onCreateTask,
  onCreateFromEmail,
  onSelectTask,
  onToggleTask,
  onDeleteTask,
}) {
  const openTasks = tasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed);
  const updateDraft = (field, value) => setTaskDraft((current) => ({ ...current, [field]: value }));
  const updateDraftLocation = (locationId) => {
    const location = locations.find((item) => item.id === locationId);
    setTaskDraft((current) => ({
      ...current,
      locationId,
      mapPoint: location?.mapPoint ? { ...location.mapPoint } : current.mapPoint || { x: 74, y: 48 },
    }));
  };

  return (
    <aside className={`personal-space-drawer ${open ? 'open' : ''} ${embedded ? 'embedded' : ''}`} aria-hidden={!open && !embedded}>
      <section className="personal-task-center">
        <div className="personal-head">
          <span className="personal-icon">
            <ClipboardCheck size={16} />
          </span>
          <span>
            <strong>Personal Space</strong>
            <small>Private map layer on this browser</small>
          </span>
          {showClose && (
            <button className="icon-button-lite" onClick={onClose} aria-label="Close Personal Space">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="personal-mode-card">
          <div>
            <strong>{personalMode ? 'Personal map layer is on' : 'Personal map layer is off'}</strong>
            <small>
              {visibleTaskCount} visible of {openTasks.length} personal event{openTasks.length === 1 ? '' : 's'} / {remindedEventCount} reminders /{' '}
              {checkedEventCount} check-ins
            </small>
          </div>
          <button className={personalMode ? 'ghost-button small' : 'primary-button small'} onClick={personalMode ? onExitPersonalMode : onEnterPersonalMode}>
            {personalMode ? 'Exit mode' : 'Enter mode'}
          </button>
        </div>

        {notice && <div className="personal-notice">{notice}</div>}

        <section className="ai-extract-card">
          <div className="personal-list-title">
            <span>AI extract from email</span>
            <span>{aiDraftReady ? 'draft ready' : 'paste text'}</span>
          </div>
          <textarea
            rows={5}
            value={forwardedEmail}
            onChange={(event) => setForwardedEmail(event.target.value)}
            placeholder="Paste a forwarded email or notice. AI will extract title, time, location, theme, and a first map coordinate for a private Personal Space event."
          />
          <button className="primary-button" onClick={onCreateFromEmail} disabled={!forwardedEmail.trim()}>
            <Sparkles size={15} />
            Extract editable draft
          </button>
        </section>

        <div className="personal-composer">
          <div className="personal-list-title">
            <span>{aiDraftReady ? 'Editable AI draft' : 'Add personal event'}</span>
            <span>{getPersonalTaskTypeLabel(taskDraft.type)}</span>
          </div>
          <input
            value={taskDraft.title}
            onChange={(event) => updateDraft('title', event.target.value)}
            placeholder="Private event title"
          />
          <div className="field-pair">
            <input
              type="datetime-local"
              value={taskDraft.dueTime}
              onChange={(event) => updateDraft('dueTime', event.target.value)}
            />
            <select value={taskDraft.type || 'personal'} onChange={(event) => updateDraft('type', event.target.value)}>
              <option value="personal">Personal</option>
              {EVENT_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <select value={taskDraft.scopeId || 'all'} onChange={(event) => updateDraft('scopeId', event.target.value)}>
            {STUDENT_LENSES.map((scope) => (
              <option key={scope.id} value={scope.id}>
                {scope.label} / {scope.labelZh}
              </option>
            ))}
          </select>
          <select value={taskDraft.locationId} onChange={(event) => updateDraftLocation(event.target.value)}>
            <option value="">Custom map point</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {getLocationLabel(location)}
              </option>
            ))}
          </select>
          <p className="drag-helper">Save it, then drag the personal marker on the map to fine-tune the position.</p>
          <textarea value={taskDraft.note} onChange={(event) => updateDraft('note', event.target.value)} placeholder="Private note" />
          <button className="primary-button" onClick={onCreateTask} disabled={!taskDraft.title.trim()}>
            <Plus size={15} />
            Save to Personal Space
          </button>
        </div>

      {showSelectedDetail && selectedTask && (
        <PersonalTaskDetail
          task={selectedTask}
          location={locations.find((location) => location.id === selectedTask.locationId)}
          now={now}
          onToggle={() => onToggleTask(selectedTask)}
          onDelete={() => onDeleteTask(selectedTask)}
        />
      )}

      <div className="personal-task-list">
        <div className="personal-list-title">
          <span>{openTasks.length} open</span>
          <span>{completedTasks.length} done</span>
        </div>
        {tasks.length === 0 ? (
          <p>No private personal events yet.</p>
        ) : (
          tasks.slice(0, 8).map((task) => {
            const status = getPersonalTaskStatus(task, now);
            const location = locations.find((item) => item.id === task.locationId);
            return (
              <div
                key={task.id}
                className={`personal-task-row ${selectedTaskId === task.id ? 'active' : ''} ${task.completed ? 'completed' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelectTask(task)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelectTask(task);
                }}
                style={{ '--type-color': task.type === 'personal' ? PERSONAL_TASK_COLOR : getEventType(task.type).color }}
              >
                <span className="personal-row-icon">
                  <EventTypeIcon typeId={task.type} size={15} />
                </span>
                <span>
                  <strong>{task.title}</strong>
                  <small>
                    {formatPersonalTaskDue(task)} / {getPersonalTaskTypeLabel(task.type)} / {getScopeLabel(task.scopeId, 'en', true)} /{' '}
                    {location ? getLocationLabel(location) : 'Custom point'}
                  </small>
                </span>
                <em className={`event-status ${status.tone}`}>{status.label}</em>
                <span className="personal-row-actions">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleTask(task);
                    }}
                    title={task.completed ? 'Reopen' : 'Complete'}
                  >
                    <CheckCircle2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteTask(task);
                    }}
                    title="Delete private task"
                  >
                    <X size={14} />
                  </button>
                </span>
              </div>
            );
          })
        )}
      </div>
      </section>
    </aside>
  );
}

function PersonalTaskDetail({ task, location, now, onToggle, onDelete }) {
  const status = getPersonalTaskStatus(task, now);
  return (
    <div className="panel-flow personal-detail">
      <div className="event-detail">
        <div className="detail-kicker">
          <span className="personal-pill">
            <ClipboardCheck size={13} />
            Private personal event
          </span>
          <em className={`event-status ${status.tone}`}>{status.label}</em>
        </div>
        <h2>{task.title}</h2>
        <p>{task.note || 'No private note.'}</p>
      </div>
      <div className="info-grid">
        <div>
          <span>Due</span>
          <strong>{formatPersonalTaskDue(task)}</strong>
        </div>
        <div>
          <span>Location</span>
          <strong>{location ? getLocationLabel(location) : 'No public map location attached'}</strong>
        </div>
        <div>
          <span>Theme</span>
          <strong>{getPersonalTaskTypeLabel(task.type)}</strong>
        </div>
        <div>
          <span>Scope</span>
          <strong>{getScopeLabel(task.scopeId)}</strong>
        </div>
        <div>
          <span>Source</span>
          <strong>{task.source === 'forwarded-email' ? 'Forwarded email' : task.source === 'agent' ? 'SMART Agent personal action' : 'Manual'}</strong>
        </div>
      </div>
      <div className="personal-detail-actions">
        <button className="primary-button" onClick={onToggle}>
          <CheckCircle2 size={15} />
          {task.completed ? 'Reopen personal event' : 'Mark personal event done'}
        </button>
        <button className="ghost-button danger-soft" onClick={onDelete}>
          <X size={15} />
          Delete
        </button>
      </div>
    </div>
  );
}

function EmptyPanel({ t = (key) => getText('en', key) }) {
  return (
    <div className="empty-panel">
      <MapPin size={22} />
      <strong>{t('noEvents')}</strong>
      <p>{t('tryFilters')}</p>
    </div>
  );
}

function PersonalEventControls({
  event,
  personalMode,
  personalMeta,
  compact = false,
  onToggleEventReminder,
  onToggleEventCheckin,
  onUpdateEventFeedback,
}) {
  const personalState = getPersonalEventState(event, personalMeta);
  const feedbackRef = useRef(null);
  const readFeedback = () => feedbackRef.current?.value || personalState.feedback || '';

  if (!personalMode) return null;

  const stop = (interaction) => interaction.stopPropagation();

  return (
    <div className={`personal-event-actions ${compact ? 'compact' : ''}`} onClick={stop}>
      <button
        type="button"
        className={personalState.reminded ? 'active' : ''}
        onClick={(interaction) => {
          interaction.stopPropagation();
          onToggleEventReminder?.(event.id);
        }}
      >
        <Clock size={14} />
        {personalState.reminded ? 'Reminder on' : 'Remind me'}
      </button>
      <button
        type="button"
        className={personalState.checked ? 'active checked' : ''}
        onClick={(interaction) => {
          interaction.stopPropagation();
          onToggleEventCheckin?.(event.id, readFeedback());
        }}
      >
        <CheckCircle2 size={14} />
        {personalState.checked ? 'Checked in' : 'Check in'}
      </button>
      {!compact && (
        <div className="personal-feedback-box" onClick={stop}>
          <span>Private check-in feedback</span>
          <textarea
            key={`${event.id}-${personalState.feedback}`}
            ref={feedbackRef}
            rows={3}
            defaultValue={personalState.feedback || ''}
            placeholder="What did you learn, finish, or need to follow up?"
          />
          <button
            type="button"
            onClick={(interaction) => {
              interaction.stopPropagation();
              onUpdateEventFeedback?.(event.id, readFeedback());
            }}
          >
            Save feedback
          </button>
        </div>
      )}
    </div>
  );
}

function LocationStackDetail({
  stack,
  personalTasks = [],
  selectedPersonalTaskId,
  locationSnapshot,
  updatedLabel,
  now,
  language = 'en',
  t = (key) => getText('en', key),
  personalMode = false,
  personalMeta = normalizePersonalMeta(),
  onSelectEvent,
  onToggleEventReminder,
  onToggleEventCheckin,
  onUpdateEventFeedback,
  onSelectPersonalTask,
  onTogglePersonalTask,
}) {
  const location = stack.location;
  const routeSummary = getRouteSummary(locationSnapshot?.point, location, language);
  const personalizedEvents = personalMode
    ? stack.events.filter((event) => {
        const state = getPersonalEventState(event, personalMeta);
        return state.reminded || state.checked;
      })
    : [];
  return (
    <div className="panel-flow">
      <div className="place-card">
        <span className="eyebrow">{t('place')}</span>
        <h2>{getLocationLabel(location)}</h2>
        <p>{location.entranceHint}</p>
        <div className="location-meta">
          <span>
            <Building2 size={14} />
            {location.campus} / {location.buildingId || location.buildingName}
          </span>
          <span>
            <LocateFixed size={14} />
            {[location.floor, location.room || location.area].filter(Boolean).join(' / ') || 'Campus area'}
          </span>
          <span>
            <Navigation size={14} />
            {routeSummary}
          </span>
        </div>
        <div className="trust-row">
          <span className={location.verified ? 'trust-badge verified' : 'trust-badge warning'}>
            {location.verified ? 'Verified location' : 'Needs verification'}
          </span>
          <span className="trust-badge">{PRECISION_LABELS[location.precision]}</span>
          <span className="trust-badge">{updatedLabel}</span>
        </div>
      </div>

      <div className="section-heading">
        <CalendarDays size={17} />
        <strong>
          {language === 'zh'
            ? `${stack.events.length} ${t('eventsHere')}`
            : `${stack.events.length} event${stack.events.length === 1 ? '' : 's'} here`}
        </strong>
      </div>

      {stack.events.length > 0 ? (
        <div className="event-list">
          {stack.events.map((event) => {
            const personalState = getPersonalEventState(event, personalMeta);
            return (
              <div
                key={event.id}
                className={`event-row ${personalState.reminded ? 'personal-reminded' : ''} ${
                  personalState.checked ? 'personal-checked' : ''
                }`}
                role="button"
                tabIndex={0}
                onClick={() => onSelectEvent(event.id)}
                onKeyDown={(interaction) => {
                  if (interaction.key === 'Enter' || interaction.key === ' ') onSelectEvent(event.id);
                }}
              >
                <span>
                  <strong>{event.title}</strong>
                  <small>{formatEventTime(event)} / {event.organizer || 'Organizer not set'}</small>
                </span>
                <span className="event-row-side">
                  <em className={`event-status ${getEventStatus(event, now, language).tone}`}>
                    {getEventStatus(event, now, language).label}
                  </em>
                  <TypePill typeId={event.type} />
                  <PersonalEventControls
                    event={event}
                    personalMode={personalMode}
                    personalMeta={personalMeta}
                    compact
                    onToggleEventReminder={onToggleEventReminder}
                    onToggleEventCheckin={onToggleEventCheckin}
                    onUpdateEventFeedback={onUpdateEventFeedback}
                  />
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p>No public events at this place right now.</p>
      )}

      {personalMode && (
        <>
          <div className="section-heading personal-section-heading">
            <Clock size={17} />
            <strong>My reminders and check-ins</strong>
          </div>
          <div className="event-list">
            {personalizedEvents.length > 0 ? (
              personalizedEvents.map((event) => {
                const personalState = getPersonalEventState(event, personalMeta);
                return (
                  <div key={`personal-state-${event.id}`} className="personal-state-row">
                    <span>
                      <strong>{event.title}</strong>
                      <small>
                        {personalState.reminded ? 'Reminder on' : 'No reminder'} /{' '}
                        {personalState.checked ? `Checked in${personalState.feedback ? `: ${personalState.feedback}` : ''}` : 'Not checked in'}
                      </small>
                    </span>
                    <TypePill typeId={event.type} />
                  </div>
                );
              })
            ) : (
              <p>No private reminders or check-ins at this place yet.</p>
            )}
          </div>
        </>
      )}

      {personalTasks.length > 0 && (
        <>
          <div className="section-heading personal-section-heading">
            <ClipboardCheck size={17} />
            <strong>
              {personalTasks.length} my personal event{personalTasks.length === 1 ? '' : 's'} here
            </strong>
          </div>
          <div className="event-list">
            {personalTasks.map((task) => {
              const status = getPersonalTaskStatus(task, now);
              return (
                <div
                  key={task.id}
                  className={`event-row personal-inline-task ${selectedPersonalTaskId === task.id ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectPersonalTask(task)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onSelectPersonalTask(task);
                  }}
                >
                  <span>
                    <strong>{task.title}</strong>
                    <small>{formatPersonalTaskDue(task)} / {getPersonalTaskTypeLabel(task.type)} / visible only in your Personal Space</small>
                  </span>
                  <span className="event-row-side">
                    <em className={`event-status ${status.tone}`}>{status.label}</em>
                    <button
                      type="button"
                      className="personal-inline-done"
                      onClick={(event) => {
                        event.stopPropagation();
                        onTogglePersonalTask(task);
                      }}
                      title="Complete private task"
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function EventDetail({
  event,
  location,
  locationSnapshot,
  updatedLabel,
  now,
  language = 'en',
  t = (key) => getText('en', key),
  personalMode = false,
  personalMeta = normalizePersonalMeta(),
  onToggleEventReminder,
  onToggleEventCheckin,
  onUpdateEventFeedback,
  onBack,
}) {
  const status = getEventStatus(event, now, language);
  const personalState = getPersonalEventState(event, personalMeta);
  return (
    <div className="panel-flow">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={16} />
        {t('back')}
      </button>

      <div className="event-detail">
        <div className="detail-kicker">
          <TypePill typeId={event.type} />
          <em className={`event-status ${status.tone}`}>{status.label}</em>
          {personalMode && personalState.reminded && <span className="personal-pill">Reminder on</span>}
          {personalMode && personalState.checked && <span className="personal-pill checked">Checked in</span>}
        </div>
        <h2>{event.title}</h2>
        <p>{event.summary}</p>
        <TrustBadges event={event} location={location} />
      </div>

      <PersonalEventControls
        event={event}
        personalMode={personalMode}
        personalMeta={personalMeta}
        onToggleEventReminder={onToggleEventReminder}
        onToggleEventCheckin={onToggleEventCheckin}
        onUpdateEventFeedback={onUpdateEventFeedback}
      />

      <div className="info-grid">
        <div>
          <span>{t('time')}</span>
          <strong>{formatEventTime(event)}</strong>
        </div>
        <div>
          <span>{t('location')}</span>
          <strong>{getLocationLabel(location)}</strong>
        </div>
        <div>
          <span>{t('organizer')}</span>
          <strong>{event.organizer || 'Not set'}</strong>
        </div>
        <div>
          <span>{t('audience')}</span>
          <strong>{event.audience || 'All students'}</strong>
        </div>
        <div>
          <span>{t('howToGetThere')}</span>
          <strong>
            {getRouteSummary(locationSnapshot?.point, location, language)} {location?.entranceHint || 'Location guidance not set'}
          </strong>
        </div>
        <div>
          <span>{t('registration')}</span>
          <strong>{event.registration || 'Check announcement'}</strong>
        </div>
        <div>
          <span>{t('source')}</span>
          <strong>{event.sourceLabel || (event.official ? 'Official source' : 'Campus listing')}</strong>
        </div>
        <div>
          <span>{t('freshness')}</span>
          <strong>{updatedLabel}</strong>
        </div>
      </div>

      {event.sourceUrl && (
        <a className="primary-link" href={event.sourceUrl} target="_blank" rel="noreferrer">
          {t('officialSource')}
          <ExternalLink size={16} />
        </a>
      )}
    </div>
  );
}

function AdminLogin({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (event) => {
    event.preventDefault();
    if (password === ADMIN_PASSWORD) {
      localStorage.setItem(ADMIN_SESSION_KEY, 'active');
      onLogin();
      return;
    }
    setError('Wrong admin password.');
  };

  return (
    <main className="admin-login-shell">
      <form className="admin-login-card" onSubmit={submit}>
        <span className="eyebrow">Admin console</span>
        <h1>TC Event Operations</h1>
        <p>Enter the admin password to manage public events and public map locations.</p>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Admin password"
            autoFocus
          />
        </label>
        {error && <div className="admin-login-error">{error}</div>}
        <button className="primary-button" type="submit">
          <ShieldCheck size={16} />
          Log in
        </button>
        <a className="text-button" href={getAppPath()}>
          Back to student map
        </a>
      </form>
    </main>
  );
}

function AdminApp({ data, updateData, resetData, onLogout }) {
  const now = useNow(60000);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedEventId, setSelectedEventId] = useState(data.events[0]?.id || null);
  const [selectedLocationId, setSelectedLocationId] = useState(data.events[0]?.locationId || data.locations[0]?.id || null);
  const [editMode, setEditMode] = useState(false);
  const [lastMove, setLastMove] = useState(null);
  const [adminRole, setAdminRole] = useState('admin');
  const canEditEvents = adminRole === 'admin' || adminRole === 'publisher';
  const canEditPlaces = adminRole === 'admin' || adminRole === 'verifier';
  const canPublish = adminRole === 'admin' || adminRole === 'publisher';

  const allEvents = useMemo(
    () => filterEvents(data.events, data.locations, { query, type: typeFilter, publication: 'all' }),
    [data.events, data.locations, query, typeFilter],
  );
  const stacks = useMemo(() => buildLocationStacks(data.events, data.locations), [data.events, data.locations]);
  const locationsById = useMemo(() => new Map(data.locations.map((location) => [location.id, location])), [data.locations]);
  const selectedEvent = data.events.find((event) => event.id === selectedEventId) || null;
  const selectedLocation = locationsById.get(selectedLocationId || selectedEvent?.locationId) || data.locations[0] || null;
  const health = useMemo(() => getDataHealth(data), [data]);
  const reviewStats = useMemo(
    () =>
      data.events.reduce(
        (stats, event) => ({
          ...stats,
          [event.reviewStatus || 'draft']: (stats[event.reviewStatus || 'draft'] || 0) + 1,
        }),
        {},
      ),
    [data.events],
  );

  const updateEvent = (eventId, patch) => {
    if (!canEditEvents) return;
    updateData((current) => ({
      ...current,
      events: current.events.map((event) => {
        if (event.id !== eventId) return event;
        const next = { ...event, ...patch };
        const isDraftFieldChange = Object.keys(patch).some((field) => field !== 'reviewStatus');
        if (event.publishedSnapshot && isDraftFieldChange && event.reviewStatus === 'published') {
          return { ...next, reviewStatus: 'changed' };
        }
        return next;
      }),
    }));
  };

  const updateLocation = (locationId, patch) => {
    if (!canEditPlaces) return;
    updateData((current) => ({
      ...current,
      locations: current.locations.map((location) => (location.id === locationId ? { ...location, ...patch } : location)),
    }));
  };

  const moveLocation = (locationId, mapPoint, originalPoint) => {
    if (!canEditPlaces) return;
    setLastMove((previous) => previous || { locationId, mapPoint: originalPoint });
    updateLocation(locationId, { mapPoint });
  };

  const undoLastMove = () => {
    if (!lastMove) return;
    updateLocation(lastMove.locationId, { mapPoint: lastMove.mapPoint });
    setLastMove(null);
  };

  const createEvent = () => {
    if (!canEditEvents) return;
    const locationId = selectedLocation?.id || data.locations[0]?.id;
    const event = {
      id: uid('event'),
      title: 'New TC campus event',
      type: 'academic',
      organizer: '',
      official: false,
      sourceUrl: '',
      sourceLabel: '',
      startTime: '',
      endTime: '',
      locationId,
      studentLenses: ['campus'],
      summary: '',
      audience: 'Students',
      registration: '',
      reviewStatus: 'draft',
    };
    updateData((current) => ({ ...current, events: [event, ...current.events] }));
    setSelectedEventId(event.id);
  };

  const createLocation = () => {
    if (!canEditPlaces) return;
    const location = {
      id: uid('location'),
      campus: 'TC',
      buildingId: '',
      buildingName: 'New location',
      floor: '',
      room: '',
      area: '',
      entranceHint: '',
      precision: 'building',
      mapPoint: { x: 74, y: 48 },
      verified: false,
    };
    updateData((current) => ({ ...current, locations: [location, ...current.locations] }));
    setSelectedLocationId(location.id);
    setEditMode(true);
  };

  const publishEvent = (eventId) => {
    if (!canPublish) return;
    updateData((current) => ({
      ...current,
      events: current.events.map((event) =>
        event.id === eventId
          ? {
              ...event,
              reviewStatus: 'published',
              publishedSnapshot: createPublishedSnapshot(event),
              publishedAt: new Date().toISOString(),
            }
          : event,
      ),
    }));
  };

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="eyebrow">Admin console</span>
          <h1>TC Event Operations</h1>
          <a href={getAppPath()}>Open student map</a>
          <button className="text-button admin-logout" onClick={onLogout}>
            Log out
          </button>
        </div>

        <div className="role-switcher" aria-label="Admin role">
          {[
            { id: 'admin', label: 'Admin' },
            { id: 'publisher', label: 'Publisher' },
            { id: 'verifier', label: 'Verifier' },
          ].map((role) => (
            <button key={role.id} className={adminRole === role.id ? 'active' : ''} onClick={() => setAdminRole(role.id)}>
              {role.label}
            </button>
          ))}
        </div>

        <label className="search-box compact">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search admin data" />
        </label>

        <div className="admin-actions">
          <button className="primary-button" onClick={createEvent} disabled={!canEditEvents}>
            <Plus size={16} />
            Event
          </button>
          <button className="ghost-button" onClick={createLocation} disabled={!canEditPlaces}>
            <MapPin size={16} />
            Place
          </button>
        </div>

        <div className="ops-summary">
          <span>
            <strong>{reviewStats.published || 0}</strong>
            Published
          </span>
          <span>
            <strong>{reviewStats.pending || 0}</strong>
            Pending
          </span>
          <span>
            <strong>{reviewStats.draft || 0}</strong>
            Draft
          </span>
          <span>
            <strong>{reviewStats['needs-location-check'] || 0}</strong>
            Location
          </span>
        </div>

        <div className="filter-strip compact">
          <button className={typeFilter === 'all' ? 'active' : ''} onClick={() => setTypeFilter('all')}>
            All
          </button>
          {EVENT_TYPES.map((type) => (
            <button key={type.id} className={typeFilter === type.id ? 'active' : ''} onClick={() => setTypeFilter(type.id)}>
              {type.label}
            </button>
          ))}
        </div>

        <div className="admin-list">
          {allEvents.map((event) => (
            <button
              key={event.id}
              className={`admin-event-row ${selectedEventId === event.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedEventId(event.id);
                setSelectedLocationId(event.locationId);
              }}
            >
              <span>
                <strong>{event.title}</strong>
                <small>{getLocationLabel(locationsById.get(event.locationId))}</small>
              </span>
              <em className={`review-state ${event.reviewStatus}`}>{event.reviewStatus}</em>
            </button>
          ))}
        </div>
      </aside>

      <section className="admin-map-area">
        <div className="admin-statusbar">
          <span>
            <Save size={16} />
            Autosaved local draft
          </span>
          <button
            className={editMode ? 'primary-button small' : 'ghost-button small'}
            onClick={() => setEditMode((value) => !value)}
            disabled={!canEditPlaces}
          >
            <Move size={15} />
            {editMode ? 'Moving points' : 'Move points'}
          </button>
          <button className="ghost-button small" onClick={undoLastMove} disabled={!lastMove}>
            <RotateCcw size={15} />
            Undo move
          </button>
          <button className="ghost-button small danger-soft" onClick={resetData}>
            Reset demo
          </button>
        </div>

        {editMode && (
          <div className="admin-mode-banner">
            <Move size={16} />
            Admin editing mode: drag place markers to reposition them. Student users cannot move points.
          </div>
        )}

        <CampusMap
          admin
          editMode={editMode && canEditPlaces}
          stacks={stacks}
          selectedLocationId={selectedLocation?.id}
          selectedEventId={selectedEventId}
          onSelectLocation={(locationId) => {
            setSelectedLocationId(locationId);
            const firstEvent = data.events.find((event) => event.locationId === locationId);
            if (firstEvent) setSelectedEventId(firstEvent.id);
          }}
          onMoveLocation={moveLocation}
        />
      </section>

      <aside className="admin-editor">
        <LocationEditor location={selectedLocation} updateLocation={updateLocation} canEdit={canEditPlaces} />
        <EventEditor
          event={selectedEvent}
          locations={data.locations}
          updateEvent={updateEvent}
          publishEvent={publishEvent}
          canEdit={canEditEvents}
          canPublish={canPublish}
          now={now}
          setSelectedLocationId={setSelectedLocationId}
        />
        <HealthPanel checks={health} />
      </aside>
    </main>
  );
}

function LocationEditor({ location, updateLocation, canEdit }) {
  if (!location) return null;
  const patch = (field, value) => updateLocation(location.id, { [field]: value });
  const patchPoint = (axis, value) =>
    updateLocation(location.id, { mapPoint: { ...location.mapPoint, [axis]: Number(value) || 0 } });

  return (
    <section className="editor-card">
      <div className="editor-head">
        <MapPin size={18} />
        <strong>Place</strong>
      </div>
      <input disabled={!canEdit} value={location.buildingName} onChange={(event) => patch('buildingName', event.target.value)} placeholder="Building name" />
      <div className="field-pair">
        <input disabled={!canEdit} value={location.buildingId} onChange={(event) => patch('buildingId', event.target.value)} placeholder="Building ID" />
        <input disabled={!canEdit} value={location.floor} onChange={(event) => patch('floor', event.target.value)} placeholder="Floor" />
      </div>
      <div className="field-pair">
        <input disabled={!canEdit} value={location.room} onChange={(event) => patch('room', event.target.value)} placeholder="Room" />
        <input disabled={!canEdit} value={location.area} onChange={(event) => patch('area', event.target.value)} placeholder="Area" />
      </div>
      <textarea
        disabled={!canEdit}
        value={location.entranceHint}
        onChange={(event) => patch('entranceHint', event.target.value)}
        placeholder="How should students get there?"
      />
      <div className="field-pair">
        <select disabled={!canEdit} value={location.precision} onChange={(event) => patch('precision', event.target.value)}>
          {Object.entries(PRECISION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="checkline">
          <input disabled={!canEdit} type="checkbox" checked={location.verified} onChange={(event) => patch('verified', event.target.checked)} />
          Verified
        </label>
      </div>
      <div className="field-pair">
        <input disabled={!canEdit} type="number" value={location.mapPoint.x} onChange={(event) => patchPoint('x', event.target.value)} />
        <input disabled={!canEdit} type="number" value={location.mapPoint.y} onChange={(event) => patchPoint('y', event.target.value)} />
      </div>
    </section>
  );
}

function EventEditor({ event, locations, updateEvent, publishEvent, canEdit, canPublish, now, setSelectedLocationId }) {
  if (!event) {
    return (
      <section className="editor-card empty-editor">
        <ClipboardCheck size={20} />
        <strong>Select or create an event</strong>
      </section>
    );
  }

  const patch = (field, value) => updateEvent(event.id, { [field]: value });
  const eventScopeId = getEventLenses(event)[0] || 'all';

  return (
    <section className="editor-card">
      <div className="editor-head">
        <CalendarDays size={18} />
        <strong>Event</strong>
      </div>
      <div className="publish-strip">
        <span>
          Student map:{' '}
          <strong>{event.publishedSnapshot ? `published ${formatUpdatedAt(event.publishedAt, now)}` : 'not published'}</strong>
        </span>
        <button className="primary-button small" onClick={() => publishEvent(event.id)} disabled={!canPublish}>
          Publish snapshot
        </button>
      </div>
      <input disabled={!canEdit} value={event.title} onChange={(input) => patch('title', input.target.value)} placeholder="Event title" />
      <textarea disabled={!canEdit} value={event.summary} onChange={(input) => patch('summary', input.target.value)} placeholder="Student-facing summary" />
      <div className="field-pair">
        <select disabled={!canEdit} value={event.type} onChange={(input) => patch('type', input.target.value)}>
          {EVENT_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
        <select disabled={!canEdit} value={event.reviewStatus} onChange={(input) => patch('reviewStatus', input.target.value)}>
          <option value="draft">Draft</option>
          <option value="pending">Pending review</option>
          <option value="published">Published</option>
          <option value="changed">Changed after publish</option>
          <option value="needs-location-check">Needs location check</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div className="field-pair">
        <input disabled={!canEdit} type="datetime-local" value={event.startTime} onChange={(input) => patch('startTime', input.target.value)} />
        <input disabled={!canEdit} type="datetime-local" value={event.endTime} onChange={(input) => patch('endTime', input.target.value)} />
      </div>
      <input disabled={!canEdit} value={event.organizer} onChange={(input) => patch('organizer', input.target.value)} placeholder="Organizer" />
      <input disabled={!canEdit} value={event.audience} onChange={(input) => patch('audience', input.target.value)} placeholder="Audience" />
      <input disabled={!canEdit} value={event.registration} onChange={(input) => patch('registration', input.target.value)} placeholder="Registration info" />
      <label className="scope-editor">
        <span>Publish scope</span>
        <select disabled={!canEdit} value={eventScopeId} onChange={(input) => patch('studentLenses', [input.target.value])}>
          {STUDENT_LENSES.map((scope) => (
            <option key={scope.id} value={scope.id}>
              {scope.label} / {scope.labelZh}
            </option>
          ))}
        </select>
      </label>
      <select
        disabled={!canEdit}
        value={event.locationId}
        onChange={(input) => {
          patch('locationId', input.target.value);
          setSelectedLocationId(input.target.value);
        }}
      >
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {getLocationLabel(location)}
          </option>
        ))}
      </select>
      <label className="checkline">
        <input disabled={!canEdit} type="checkbox" checked={event.official} onChange={(input) => patch('official', input.target.checked)} />
        Official source
      </label>
      <input disabled={!canEdit} value={event.sourceLabel || ''} onChange={(input) => patch('sourceLabel', input.target.value)} placeholder="Source label" />
      <input disabled={!canEdit} value={event.sourceUrl} onChange={(input) => patch('sourceUrl', input.target.value)} placeholder="Source URL" />
    </section>
  );
}

function HealthPanel({ checks }) {
  return (
    <section className="editor-card health-card">
      <div className="editor-head">
        <Sparkles size={18} />
        <strong>Map check</strong>
      </div>
      {checks.length === 0 ? (
        <p>No obvious data gaps.</p>
      ) : (
        checks.slice(0, 8).map((check, index) => (
          <div key={`${check.label}-${index}`} className={`health-row ${check.level}`}>
            {check.label}
          </div>
        ))
      )}
    </section>
  );
}

export default function App() {
  const [data, updateData, setData] = useCampusData();
  const [, setRouteVersion] = useState(() => `${window.location.pathname}${window.location.hash}`);
  const isAdmin = isAdminRoute();
  const isMobile = isMobileRoute();
  const [adminAuthed, setAdminAuthed] = useState(() => localStorage.getItem(ADMIN_SESSION_KEY) === 'active');

  useEffect(() => {
    const syncRoute = () => setRouteVersion(`${window.location.pathname}${window.location.hash}`);
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('popstate', syncRoute);
    };
  }, []);

  const resetData = () => {
    if (!window.confirm('Reset the local demo dataset? This will replace your current local edits.')) return;
    const next = normalizeCampusData(createDefaultData());
    setData(next);
  };

  if (isAdmin && !adminAuthed) return <AdminLogin onLogin={() => setAdminAuthed(true)} />;

  return isAdmin ? (
    <AdminApp
      data={data}
      updateData={updateData}
      resetData={resetData}
      onLogout={() => {
        localStorage.removeItem(ADMIN_SESSION_KEY);
        setAdminAuthed(false);
      }}
    />
  ) : (
    <StudentApp data={data} mobile={isMobile} />
  );
}
