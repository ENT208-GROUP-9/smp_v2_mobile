import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AnimatePresence, m } from 'framer-motion';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import {
  CalendarClock,
  CheckCircle2,
  Crosshair,
  Eye,
  EyeOff,
  Filter,
  Image as ImageIcon,
  Import,
  ListTodo,
  LocateFixed,
  MapPinned,
  MoveRight,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import './App.css';

const Motion = m;

const STORAGE_MAP_KEY = 'campus-map-base-image';
const STORAGE_ANCHORS_KEY = 'campus-map-anchors';
const STORAGE_SETUP_KEY = 'campus-map-setup-complete';
const STORAGE_MAP_META_KEY = 'campus-map-meta';
const STORAGE_TASKS_KEY = 'campus-map-tasks';

const TASK_TYPES = [
  { id: 'main', label: 'Main Task', tone: 'main' },
  { id: 'side', label: 'Side Task', tone: 'side' },
  { id: 'daily', label: 'Daily Task', tone: 'daily' },
  { id: 'event', label: 'Event Task', tone: 'event' },
  { id: 'danger', label: 'Alert Task', tone: 'danger' },
  { id: 'explore', label: 'Explore Point', tone: 'explore' },
];

const TASK_SNAP_DISTANCE = 1.4;

function safeReadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function createAnchor(index) {
  return {
    id: `anchor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    short: String(index + 1).padStart(2, '0'),
    name: '',
    x: null,
    y: null,
    lat: null,
    lng: null,
    gpsAccuracy: null,
  };
}

function getNextPendingAnchor(anchors) {
  return (
    anchors.find((anchor) => !isAnchorReady(anchor)) || null
  );
}

function isAnchorReady(anchor) {
  return Boolean(
    anchor &&
      anchor.name?.trim() &&
      anchor.x != null &&
      anchor.y != null &&
      anchor.lat != null &&
      anchor.lng != null,
  );
}

async function getImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function hashText(text) {
  const encoded = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toDegrees(value) {
  return (value * 180) / Math.PI;
}

function getDistanceMeters(from, to) {
  const earthRadius = 6371000;
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function getGeographicBearing(from, to) {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const y = Math.sin(lngDelta) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lngDelta);

  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

function getScreenBearing(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return normalizeDegrees(toDegrees(Math.atan2(dx, -dy)));
}

function getCircularMean(values) {
  if (values.length === 0) return null;

  const vector = values.reduce(
    (accumulator, current) => ({
      x: accumulator.x + Math.cos(toRadians(current)),
      y: accumulator.y + Math.sin(toRadians(current)),
    }),
    { x: 0, y: 0 },
  );

  if (Math.abs(vector.x) < 1e-6 && Math.abs(vector.y) < 1e-6) return null;

  return normalizeDegrees(toDegrees(Math.atan2(vector.y, vector.x)));
}

function estimateMapNorthOffset(anchors) {
  if (anchors.length < 2) return null;

  const offsets = [];
  for (let index = 0; index < anchors.length; index += 1) {
    for (let pairIndex = index + 1; pairIndex < anchors.length; pairIndex += 1) {
      const start = anchors[index];
      const end = anchors[pairIndex];
      const geoDistance = getDistanceMeters(start, end);
      const screenDistance = Math.hypot(end.x - start.x, end.y - start.y);
      if (geoDistance < 5 || screenDistance < 1) continue;
      offsets.push(
        normalizeDegrees(getGeographicBearing(start, end) - getScreenBearing(start, end)),
      );
    }
  }

  return getCircularMean(offsets);
}

function estimateMetersPerPercent(anchors) {
  if (anchors.length < 2) return null;

  const ratios = [];
  for (let index = 0; index < anchors.length; index += 1) {
    for (let pairIndex = index + 1; pairIndex < anchors.length; pairIndex += 1) {
      const start = anchors[index];
      const end = anchors[pairIndex];
      const geoDistance = getDistanceMeters(start, end);
      const screenDistance = Math.hypot(end.x - start.x, end.y - start.y);
      if (geoDistance < 5 || screenDistance < 1) continue;
      ratios.push(geoDistance / screenDistance);
    }
  }

  if (ratios.length === 0) return null;
  return ratios.reduce((sum, current) => sum + current, 0) / ratios.length;
}

function estimateUserMapPosition(currentLocation, anchors) {
  if (!currentLocation || anchors.length === 0) return null;
  if (anchors.length === 1) return { x: anchors[0].x, y: anchors[0].y };

  let weightSum = 0;
  let xSum = 0;
  let ySum = 0;

  for (const anchor of anchors) {
    const distance = getDistanceMeters(currentLocation, anchor);
    if (distance < 3) return { x: anchor.x, y: anchor.y };
    const weight = 1 / Math.max(distance, 3) ** 2;
    weightSum += weight;
    xSum += anchor.x * weight;
    ySum += anchor.y * weight;
  }

  if (!weightSum) return null;
  return { x: xSum / weightSum, y: ySum / weightSum };
}

function getMapDistance(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function getDirectionLabel(targetBearing, heading) {
  if (heading == null) return 'Map direction';
  const relative = normalizeDegrees(targetBearing - heading);
  if (relative < 22.5 || relative >= 337.5) return 'Ahead';
  if (relative < 67.5) return 'front-right';
  if (relative < 112.5) return 'Right';
  if (relative < 157.5) return 'back-right';
  if (relative < 202.5) return 'Behind';
  if (relative < 247.5) return 'back-left';
  if (relative < 292.5) return 'Left';
  return 'front-left';
}

function formatDateTime(value) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isTaskExpired(task) {
  if (!task.endTime || task.status === 'completed') return false;
  return Date.now() > new Date(task.endTime).getTime();
}

function getTaskTypeMeta(taskType) {
  return TASK_TYPES.find((item) => item.id === taskType) || TASK_TYPES[0];
}

function getTaskStackKey(point) {
  return `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
}

function findNearbyTaskPoint(tasks, point) {
  let closest = null;
  let minDistance = Infinity;

  for (const task of tasks) {
    const distance = getMapDistance(task, point);
    if (distance < minDistance) {
      minDistance = distance;
      closest = task;
    }
  }

  if (closest && minDistance <= TASK_SNAP_DISTANCE) {
    return { x: closest.x, y: closest.y };
  }

  return point;
}

function App() {
  const [bgImage, setBgImage] = useState(() => localStorage.getItem(STORAGE_MAP_KEY));
  const [anchors, setAnchors] = useState(() => safeReadJson(STORAGE_ANCHORS_KEY, []));
  const [setupComplete, setSetupComplete] = useState(
    () => localStorage.getItem(STORAGE_SETUP_KEY) === 'true',
  );
  const [mapMeta, setMapMeta] = useState(() => safeReadJson(STORAGE_MAP_META_KEY, null));
  const [selectedAnchorId, setSelectedAnchorId] = useState(() => {
    const savedAnchors = safeReadJson(STORAGE_ANCHORS_KEY, []);
    return getNextPendingAnchor(savedAnchors)?.id ?? savedAnchors[0]?.id ?? null;
  });
  const [tasks, setTasks] = useState(() => safeReadJson(STORAGE_TASKS_KEY, []));
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedStackKey, setSelectedStackKey] = useState(null);
  const [role, setRole] = useState('viewer');
  const [placingTask, setPlacingTask] = useState(false);
  const [taskDraftPoint, setTaskDraftPoint] = useState(null);
  const [taskDialogMode, setTaskDialogMode] = useState('create');
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    type: 'main',
    startTime: '',
    endTime: '',
  });
  const [taskQuery, setTaskQuery] = useState('');
  const [taskTypeFilter, setTaskTypeFilter] = useState('all');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [hudHidden, setHudHidden] = useState(false);
  const [isMapInteracting, setIsMapInteracting] = useState(false);
  const [mapScale, setMapScale] = useState(1);
  const [deviceHeading, setDeviceHeading] = useState(null);
  const [orientationPermissionGranted, setOrientationPermissionGranted] = useState(false);
  const [orientationStatus, setOrientationStatus] = useState(() => {
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      return 'unsupported';
    }
    const orientationEvent = window.DeviceOrientationEvent;
    return typeof orientationEvent.requestPermission === 'function' ? 'needs-permission' : 'idle';
  });
  const [orientationError, setOrientationError] = useState(() => {
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent !== 'undefined') {
      return '';
    }
    return 'Compass is not supported in this browser.';
  });
  const [userGeo, setUserGeo] = useState(null);
  const [geoStatus, setGeoStatus] = useState(() =>
    typeof navigator === 'undefined' || navigator.geolocation ? 'idle' : 'unsupported',
  );
  const [geoError, setGeoError] = useState(() =>
    typeof navigator === 'undefined' || navigator.geolocation ? '' : 'Geolocation is not supported in this browser.',
  );

  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);
  const mapImageFrameRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_ANCHORS_KEY, JSON.stringify(anchors));
  }, [anchors]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TASKS_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_SETUP_KEY, String(setupComplete));
  }, [setupComplete]);

  useEffect(() => {
    if (mapMeta) localStorage.setItem(STORAGE_MAP_META_KEY, JSON.stringify(mapMeta));
  }, [mapMeta]);

  useEffect(() => {
    if (!bgImage || !navigator.geolocation) return undefined;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserGeo({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading:
            typeof position.coords.heading === 'number' && !Number.isNaN(position.coords.heading)
              ? normalizeDegrees(position.coords.heading)
              : null,
        });
        setGeoStatus('active');
        setGeoError('');
      },
      (error) => {
        setGeoStatus('error');
        setGeoError(error.message || 'Unable to get location.');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [bgImage]);

  useEffect(() => {
    if (!bgImage) return undefined;
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      return undefined;
    }

    const orientationEvent = window.DeviceOrientationEvent;
    if (typeof orientationEvent.requestPermission === 'function' && !orientationPermissionGranted) {
      return undefined;
    }

    const updateHeading = (event) => {
      let nextHeading = null;
      if (typeof event.webkitCompassHeading === 'number') {
        nextHeading = normalizeDegrees(event.webkitCompassHeading);
      } else if (typeof event.alpha === 'number') {
        nextHeading = normalizeDegrees(360 - event.alpha);
      }

      if (nextHeading == null || Number.isNaN(nextHeading)) return;
      setDeviceHeading(nextHeading);
      setOrientationStatus('active');
      setOrientationError('');
    };

    window.addEventListener('deviceorientationabsolute', updateHeading, true);
    window.addEventListener('deviceorientation', updateHeading, true);

    return () => {
      window.removeEventListener('deviceorientationabsolute', updateHeading, true);
      window.removeEventListener('deviceorientation', updateHeading, true);
    };
  }, [bgImage, orientationPermissionGranted]);

  const selectedAnchor =
    anchors.find((anchor) => anchor.id === selectedAnchorId) ||
    getNextPendingAnchor(anchors) ||
    anchors[0] ||
    null;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const calibratedAnchors = anchors.filter(
    (anchor) =>
      anchor.x != null &&
      anchor.y != null &&
      typeof anchor.lat === 'number' &&
      typeof anchor.lng === 'number',
  );
  const mapNorthOffset = estimateMapNorthOffset(calibratedAnchors);
  const metersPerPercent = estimateMetersPerPercent(calibratedAnchors);
  const liveUserPosition = estimateUserMapPosition(userGeo, calibratedAnchors);
  const rawHeading = userGeo?.heading ?? deviceHeading;
  const mapHeading =
    rawHeading == null || mapNorthOffset == null
      ? rawHeading
      : normalizeDegrees(rawHeading - mapNorthOffset);
  const pendingAnchor = getNextPendingAnchor(anchors);
  const geoBoundAnchorCount = anchors.filter(
    (anchor) => typeof anchor.lat === 'number' && typeof anchor.lng === 'number',
  ).length;
  const pageMode = !bgImage ? 'welcome' : setupComplete ? 'map' : 'setup';
  const visibleSetupAnchors = anchors.filter((anchor) => anchor.x != null && anchor.y != null);

  const filteredTasks = tasks
    .filter((task) => {
      const query = taskQuery.trim().toLowerCase();
      const matchesQuery =
        query.length === 0 ||
        task.title.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query);

      const matchesType = taskTypeFilter === 'all' || task.type === taskTypeFilter;
      const taskStatus = task.status === 'completed' ? 'completed' : isTaskExpired(task) ? 'expired' : 'pending';
      const matchesStatus = taskStatusFilter === 'all' || taskStatus === taskStatusFilter;

      return matchesQuery && matchesType && matchesStatus;
    })
    .map((task) => {
      if (!liveUserPosition) {
        return { ...task, mapDistance: null, distanceLabel: 'Locating', directionLabel: 'Map position' };
      }
      const mapDistance = getMapDistance(liveUserPosition, task);
      const estimatedMeters = metersPerPercent == null ? null : Math.round(mapDistance * metersPerPercent);
      return {
        ...task,
        mapDistance,
        distanceLabel: estimatedMeters == null ? 'Unknown distance' : String(estimatedMeters) + ' m',
        directionLabel: getDirectionLabel(getScreenBearing(liveUserPosition, task), mapHeading),
      };
    })
    .sort((left, right) => {
      if (left.mapDistance == null && right.mapDistance == null) {
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }
      if (left.mapDistance == null) return 1;
      if (right.mapDistance == null) return -1;
      return left.mapDistance - right.mapDistance;
    });

  const groupMap = new Map();
  for (const task of filteredTasks) {
    const key = getTaskStackKey(task);
    const existing = groupMap.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      groupMap.set(key, { key, x: task.x, y: task.y, tasks: [task] });
    }
  }
  const taskGroups = Array.from(groupMap.values());
  const activeStackKey = selectedTask ? getTaskStackKey(selectedTask) : selectedStackKey;
  const selectedStack = taskGroups.find((group) => group.key === activeStackKey) || null;

  const resetTaskForm = () => {
    setTaskForm({
      title: '',
      description: '',
      type: 'main',
      startTime: '',
      endTime: '',
    });
    setTaskDraftPoint(null);
    setTaskDialogMode('create');
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      const result = loadEvent.target?.result;
      if (typeof result !== 'string') return;

      const dimensions = await getImageDimensions(result);
      const fingerprint = await hashText(result);
      setBgImage(result);
      setMapMeta({
        fingerprint,
        width: dimensions.width,
        height: dimensions.height,
        aspectRatio: Number((dimensions.width / dimensions.height).toFixed(6)),
        sourceName: file.name,
      });
      setSetupComplete(false);
      setAnchors([]);
      setTasks([]);
      setSelectedAnchorId(null);
      setSelectedTaskId(null);
      setSelectedStackKey(null);
      setPlacingTask(false);
      resetTaskForm();
      localStorage.setItem(STORAGE_MAP_KEY, result);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearWorkspace = () => {
    setBgImage(null);
    setAnchors([]);
    setTasks([]);
    setMapMeta(null);
    setSetupComplete(false);
    setSelectedAnchorId(null);
    setSelectedTaskId(null);
    setSelectedStackKey(null);
    setPlacingTask(false);
    resetTaskForm();
    localStorage.removeItem(STORAGE_MAP_KEY);
    localStorage.removeItem(STORAGE_ANCHORS_KEY);
    localStorage.removeItem(STORAGE_TASKS_KEY);
    localStorage.removeItem(STORAGE_MAP_META_KEY);
    localStorage.removeItem(STORAGE_SETUP_KEY);
  };

  const addAnchor = () => {
    setAnchors((current) => {
      const nextAnchor = createAnchor(current.length);
      setSelectedAnchorId(nextAnchor.id);
      return [...current, nextAnchor];
    });
  };

  const updateAnchorName = (anchorId, name) => {
    setAnchors((current) =>
      current.map((anchor) => (anchor.id === anchorId ? { ...anchor, name } : anchor)),
    );
  };

  const getRelativePoint = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    };
  };

  const markAnchorOnMap = (event) => {
    if (!selectedAnchor) return;
    const { x, y } = getRelativePoint(event);
    setAnchors((current) =>
      current.map((anchor) => (anchor.id === selectedAnchor.id ? { ...anchor, x, y } : anchor)),
    );
  };

  const bindSelectedAnchorGps = () => {
    if (!selectedAnchor || !userGeo) return;
    setAnchors((current) =>
      current.map((anchor) =>
        anchor.id === selectedAnchor.id
          ? {
              ...anchor,
              lat: userGeo.lat,
              lng: userGeo.lng,
              gpsAccuracy: userGeo.accuracy,
            }
          : anchor,
      ),
    );
  };

  const confirmCurrentAnchor = () => {
    if (!selectedAnchor) return;
    const ready =
      selectedAnchor.name.trim() &&
      selectedAnchor.x != null &&
      selectedAnchor.y != null &&
      selectedAnchor.lat != null &&
      selectedAnchor.lng != null;
    if (!ready) return;

    const nextPending = getNextPendingAnchor(anchors.filter((anchor) => anchor.id !== selectedAnchor.id));
    if (nextPending) {
      setSelectedAnchorId(nextPending.id);
      return;
    }
    setSetupComplete(true);
    setSelectedAnchorId(null);
  };

  const resetAnchor = () => {
    if (!selectedAnchor) return;
    setAnchors((current) =>
      current.map((anchor) =>
        anchor.id === selectedAnchor.id
          ? { ...anchor, x: null, y: null, lat: null, lng: null, gpsAccuracy: null }
          : anchor,
      ),
    );
  };

  const deleteSelectedAnchor = () => {
    if (!selectedAnchor) return;
    setAnchors((current) =>
      current
        .filter((anchor) => anchor.id !== selectedAnchor.id)
        .map((anchor, index) => ({ ...anchor, short: String(index + 1).padStart(2, '0') })),
    );
    setSelectedAnchorId(null);
  };

  const reopenAnchorSetup = () => {
    if (anchors.length === 0) {
      addAnchor();
    } else if (!selectedAnchorId) {
      setSelectedAnchorId(getNextPendingAnchor(anchors)?.id ?? anchors[0]?.id ?? null);
    }
    setPlacingTask(false);
    setSetupComplete(false);
  };

  const exportWorkspace = () => {
    if (!bgImage || !mapMeta) return;
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      map: mapMeta,
      anchors,
      tasks,
      setupComplete,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'campus-map-workspace.json';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleImportWorkspace = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !bgImage || !mapMeta) return;

    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed?.map?.fingerprint || !Array.isArray(parsed?.anchors)) {
      window.alert('Imported file format is invalid.');
      return;
    }
    if (parsed.map.fingerprint !== mapMeta.fingerprint) {
      window.alert('The imported workspace does not match the current map.');
      return;
    }

    setAnchors(parsed.anchors);
    setTasks(Array.isArray(parsed.tasks) ? parsed.tasks : []);
    setSetupComplete(Boolean(parsed.setupComplete));
    setSelectedAnchorId(getNextPendingAnchor(parsed.anchors)?.id ?? parsed.anchors[0]?.id ?? null);
    setSelectedTaskId(null);
    setSelectedStackKey(null);

    if (importInputRef.current) importInputRef.current.value = '';
  };

  const openTaskCreateDialog = (point) => {
    setTaskDialogMode('create');
    setTaskDraftPoint(point);
    setTaskForm({
      title: '',
      description: '',
      type: 'main',
      startTime: '',
      endTime: '',
    });
  };

  const openTaskEditDialog = (task) => {
    setTaskDialogMode('edit');
    setTaskDraftPoint({ x: task.x, y: task.y });
    setTaskForm({
      title: task.title,
      description: task.description,
      type: task.type,
      startTime: task.startTime ? task.startTime.slice(0, 16) : '',
      endTime: task.endTime ? task.endTime.slice(0, 16) : '',
    });
  };

  const handleTaskPlacement = (event) => {
    if (!placingTask || role !== 'uploader' || pageMode !== 'map') return;
    const point = getRelativePoint(event);
    setPlacingTask(false);
    openTaskCreateDialog(findNearbyTaskPoint(tasks, point));
  };

  const submitTask = () => {
    if (!taskForm.title.trim() || !taskDraftPoint) return;

    const payload = {
      x: taskDraftPoint.x,
      y: taskDraftPoint.y,
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      type: taskForm.type,
      status: 'pending',
      createdAt: new Date().toISOString(),
      startTime: taskForm.startTime ? new Date(taskForm.startTime).toISOString() : null,
      endTime: taskForm.endTime ? new Date(taskForm.endTime).toISOString() : null,
    };

    if (taskDialogMode === 'edit' && selectedTask) {
      setTasks((current) =>
        current.map((task) =>
          task.id === selectedTask.id ? { ...task, ...payload, id: selectedTask.id } : task,
        ),
      );
    } else {
      const task = { id: uuidv4(), ...payload };
      setTasks((current) => [...current, task]);
      setSelectedTaskId(task.id);
      setSelectedStackKey(getTaskStackKey(task));
    }

    resetTaskForm();
  };

  const toggleTaskComplete = () => {
    if (!selectedTask) return;
    setTasks((current) =>
      current.map((task) =>
        task.id === selectedTask.id
          ? { ...task, status: task.status === 'completed' ? 'pending' : 'completed' }
          : task,
      ),
    );
  };

  const deleteTask = () => {
    if (!selectedTask) return;
    setTasks((current) => current.filter((task) => task.id !== selectedTask.id));
    setSelectedTaskId(null);
  };

  const requestOrientationAccess = async () => {
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      setOrientationStatus('unsupported');
      setOrientationError('Compass is not supported in this browser.');
      return;
    }
    const orientationEvent = window.DeviceOrientationEvent;
    if (typeof orientationEvent.requestPermission !== 'function') {
      setOrientationPermissionGranted(true);
      setOrientationStatus('idle');
      return;
    }

    try {
      const result = await orientationEvent.requestPermission();
      if (result === 'granted') {
        setOrientationPermissionGranted(true);
        setOrientationStatus('idle');
        setOrientationError('');
      } else {
        setOrientationStatus('denied');
        setOrientationError('Compass permission was denied.');
      }
    } catch (error) {
      setOrientationStatus('error');
      setOrientationError(error instanceof Error ? error.message : 'Compass permission request failed.');
    }
  };

  const currentAnchorReady = selectedAnchor ? isAnchorReady(selectedAnchor) : false;

  return (
    <div className="app-shell">
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageUpload} />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={handleImportWorkspace}
      />

      <div className={`map-surface ${hudHidden ? 'hud-collapsed' : ''}`}>
        <div className="background-glow" />
        <div className="background-noise" />

        <button
          className="hide-toggle"
          onClick={() => setHudHidden((value) => !value)}
          aria-label={hudHidden ? 'Show panel' : 'Hide panel'}
        >
          {hudHidden ? <Eye size={16} /> : <EyeOff size={16} />}
          {hudHidden ? 'Show' : 'Hide'}
        </button>

        {pageMode === 'welcome' && (
          <div className="welcome-shell">
            <div className="welcome-card">
              <span className="eyebrow">Smart Campus Map</span>
              <h1>Upload a map, then finish anchor calibration step by step</h1>
              <p>Place each anchor on the map, walk to the real location, bind GPS, then confirm. After all anchors are ready, the app moves straight into task publishing and viewing.</p>
              <div className="welcome-actions">
                <button className="primary-pill" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} />
                  Upload map
                </button>
              </div>
            </div>
          </div>
        )}

        {bgImage && (
          <div className="experience-layout">
            {!hudHidden && (
              <aside className="side-panel">
                <div className="panel-card header-panel">
                  <div className="panel-row">
                    <div>
                      <span className="eyebrow">Workspace</span>
                      <h2>{pageMode === 'setup' ? 'Anchor Setup' : 'Task Map'}</h2>
                    </div>
                    <button
                      className="role-switch"
                      onClick={() => {
                        setRole((current) => (current === 'uploader' ? 'viewer' : 'uploader'));
                        setPlacingTask(false);
                      }}
                    >
                      <Settings2 size={16} />
                      {role === 'uploader' ? 'Admin mode' : 'Viewer mode'}
                    </button>
                  </div>
                  <div className="panel-actions compact-actions">
                    <button className="ghost-pill" onClick={() => importInputRef.current?.click()}>
                      <Import size={16} />
                      Import
                    </button>
                    <button className="ghost-pill" onClick={exportWorkspace}>
                      <Upload size={16} />
                      Export
                    </button>
                    <button className="ghost-pill" onClick={() => fileInputRef.current?.click()}>
                      <ImageIcon size={16} />
                      Change map
                    </button>
                    <button className="ghost-pill warning" onClick={clearWorkspace}>
                      <Trash2 size={16} />
                      Clear
                    </button>
                  </div>
                </div>

                {pageMode === 'setup' ? (
                  <>
                    <div className="panel-card">
                      <span className="eyebrow">Step By Step</span>
                      <h3>Current anchor: {selectedAnchor?.name || selectedAnchor?.short || 'Unselected'}</h3>
                      <p>Follow the four steps in order, then confirm the anchor.</p>
                      <div className="sensor-note">
                        <span>Total anchors: {anchors.length}</span>
                        <span>GPS bound: {geoBoundAnchorCount}</span>
                      </div>
                      <div className="panel-actions compact-actions">
                        <button className="primary-pill" onClick={addAnchor}>
                          <Plus size={16} />
                          Add anchor
                        </button>
                      </div>
                    </div>

                    <div className="panel-card">
                      <span className="eyebrow">Current Anchor</span>
                      {selectedAnchor ? (
                        <>
                          <label className="anchor-name-field">
                            <span>1. Name this anchor</span>
                            <input
                              value={selectedAnchor.name}
                              onChange={(event) => updateAnchorName(selectedAnchor.id, event.target.value)}
                              placeholder='For example: North Gate, Library Entrance, Track Field'
                            />
                          </label>

                          <div className="sensor-note">
                            <span>2. Click the real anchor position on the map</span>
                            <span>{selectedAnchor.x == null ? 'Map position not selected yet' : 'Map position: ' + selectedAnchor.x.toFixed(1) + ' / ' + selectedAnchor.y.toFixed(1)}</span>
                          </div>

                          <div className="sensor-note">
                            <span>3. Walk to the real place, then bind current location</span>
                            <span>
                              {selectedAnchor.lat == null
                                ? 'GPS not bound yet'
                                : 'GPS: ' + selectedAnchor.lat.toFixed(6) + ', ' + selectedAnchor.lng.toFixed(6)}
                            </span>
                          </div>

                          <div className="panel-actions compact-actions">
                            <button
                              className="ghost-pill"
                              onClick={bindSelectedAnchorGps}
                              disabled={!userGeo}
                            >
                              <LocateFixed size={16} />
                              Bind current location
                            </button>
                            <button className="ghost-pill" onClick={resetAnchor}>
                              <RotateCcw size={16} />
                              Reset this anchor
                            </button>
                            <button className="ghost-pill warning" onClick={deleteSelectedAnchor}>
                              <Trash2 size={16} />
                              Delete
                            </button>
                          </div>

                          <div className="panel-actions">
                            <button
                              className="primary-pill"
                              onClick={confirmCurrentAnchor}
                              disabled={!currentAnchorReady}
                            >
                              <CheckCircle2 size={16} />
                              Confirm this anchor
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className='empty-inline'>Create an anchor first, then start calibration.</div>
                      )}
                    </div>

                    <div className="panel-card">
                      <span className="eyebrow">Sensors</span>
                      <h3>Location status</h3>
                      <div className="sensor-note">
                        <span>Location: {geoStatus}</span>
                        <span>Compass: {orientationStatus}</span>
                      </div>
                      {userGeo && (
                        <div className="sensor-note">
                          <span>
                            Current GPS: {userGeo.lat.toFixed(6)}, {userGeo.lng.toFixed(6)}
                          </span>
                          <span>Accuracy: {userGeo.accuracy.toFixed(1)}m</span>
                        </div>
                      )}
                      {orientationStatus === 'needs-permission' && (
                        <div className="panel-actions compact-actions">
                          <button className="primary-pill" onClick={requestOrientationAccess}>
                            <LocateFixed size={16} />
                            Enable compass
                          </button>
                        </div>
                      )}
                      {(geoError || orientationError) && (
                        <div className="sensor-warning">{geoError || orientationError}</div>
                      )}
                    </div>

                    <div className="panel-card">
                      <span className="eyebrow">Anchor List</span>
                      <div className="anchor-list">
                        {anchors.length === 0 && <div className='empty-inline'>No anchors yet.</div>}
                        {anchors.map((anchor) => {
                          const ready =
                            anchor.name.trim() &&
                            anchor.x != null &&
                            anchor.y != null &&
                            anchor.lat != null &&
                            anchor.lng != null;
                          return (
                            <button
                              key={anchor.id}
                              className={`anchor-list-item ${selectedAnchor?.id === anchor.id ? 'active' : ''}`}
                              onClick={() => setSelectedAnchorId(anchor.id)}
                            >
                              <span className="anchor-badge">{anchor.short}</span>
                              <span className="anchor-copy">
                                <strong>{anchor.name || 'Unnamed anchor'}</strong>
                                <small>{ready ? 'Ready for task page' : 'Finish the 4 setup steps'}</small>
                              </span>
                              <span className={`anchor-state ${ready ? 'ready' : ''}`}>
                                {ready ? 'Ready' : 'In progress'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {!pendingAnchor && anchors.length > 0 && (
                        <div className="sensor-note">
                          <span>All anchors are complete.</span>
                          <span>The app will move to the task map automatically.</span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="panel-card">
                      <span className="eyebrow">Overview</span>
                      <h3>Task publishing and viewing</h3>
                      <p>Tasks at the same location stack together automatically. The list is sorted by distance from your live blue dot.</p>
                      <div className="stats-grid">
                        <div className="stat-tile">
                          <span>Total tasks</span>
                          <strong>{tasks.length}</strong>
                        </div>
                        <div className="stat-tile">
                          <span>Stacked points</span>
                          <strong>{taskGroups.filter((group) => group.tasks.length > 1).length}</strong>
                        </div>
                        <div className="stat-tile warning">
                          <span>Expired</span>
                          <strong>{tasks.filter((task) => isTaskExpired(task)).length}</strong>
                        </div>
                        <div className="stat-tile success">
                          <span>Completed</span>
                          <strong>{tasks.filter((task) => task.status === 'completed').length}</strong>
                        </div>
                      </div>
                      <div className="panel-actions compact-actions">
                        {orientationStatus === 'needs-permission' && (
                          <button className="ghost-pill" onClick={requestOrientationAccess}>
                            <LocateFixed size={16} />
                            Enable compass
                          </button>
                        )}
                        <button className="ghost-pill" onClick={reopenAnchorSetup}>
                          <MapPinned size={16} />
                          Manage anchors
                        </button>
                        {role === 'uploader' && (
                          <button
                            className={`primary-pill ${placingTask ? 'placing-active' : ''}`}
                            onClick={() => setPlacingTask((value) => !value)}
                          >
                            {placingTask ? <X size={16} /> : <Plus size={16} />}
                            {placingTask ? 'Cancel placing' : 'Place task'}
                          </button>
                        )}
                      </div>
                      <div className="sensor-note">
                        <span>Blue dot: {liveUserPosition ? 'Visible' : 'Bind at least one GPS anchor to show it'}</span>
                        <span>Heading: {mapHeading == null ? '--' : String(Math.round(mapHeading)) + ' deg'}</span>
                      </div>
                    </div>

                    <div className="panel-card">
                      <span className="eyebrow">Filters</span>
                      <h3>Search tasks</h3>
                      <div className="search-field">
                        <Search size={16} />
                        <input
                          value={taskQuery}
                          onChange={(event) => setTaskQuery(event.target.value)}
                          placeholder='Search by task name or description'
                        />
                      </div>
                      <div className="filter-grid">
                        <label className="select-field">
                          <span>Type</span>
                          <select value={taskTypeFilter} onChange={(event) => setTaskTypeFilter(event.target.value)}>
                            <option value='all'>All types</option>
                            {TASK_TYPES.map((type) => (
                              <option key={type.id} value={type.id}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="select-field">
                          <span>Status</span>
                          <select value={taskStatusFilter} onChange={(event) => setTaskStatusFilter(event.target.value)}>
                            <option value='all'>All statuses</option>
                            <option value='pending'>Pending</option>
                            <option value='expired'>Expired</option>
                            <option value='completed'>Completed</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="panel-card">
                      <div className="panel-row">
                        <div>
                          <span className="eyebrow">Tasks</span>
                          <h3>Nearby tasks</h3>
                        </div>
                        <span className="task-count-chip">
                          <Filter size={14} />
                          {filteredTasks.length}
                        </span>
                      </div>
                      <div className="task-list">
                        {filteredTasks.length === 0 && <div className='empty-inline'>No tasks match the current filters.</div>}
                        {filteredTasks.map((task) => {
                          const stack = taskGroups.find((group) => group.key === getTaskStackKey(task));
                          const expired = isTaskExpired(task);
                          return (
                            <button
                              key={task.id}
                              className={`task-list-item ${selectedTaskId === task.id ? 'active' : ''}`}
                              onClick={() => {
                                setSelectedTaskId(task.id);
                                setSelectedStackKey(getTaskStackKey(task));
                              }}
                            >
                              <span className={`task-tone-dot tone-${getTaskTypeMeta(task.type).tone}`} />
                              <span className="task-list-copy">
                                <strong>{task.title}</strong>
                                <small>
                                  {getTaskTypeMeta(task.type).label + ' | ' + task.directionLabel + ' | ' + task.distanceLabel}
                                </small>
                              </span>
                              <span className={`task-status-chip ${task.status} ${expired ? 'expired' : ''}`}>
                                {stack && stack.tasks.length > 1
                                  ? String(stack.tasks.length) + ' stacked'
                                  : expired
                                    ? 'Expired'
                                    : task.status === 'completed'
                                      ? 'Completed'
                                      : 'Pending'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </aside>
            )}

            <div className="map-board">
              {pageMode === 'setup' && selectedAnchor && (
                <div className="setup-tip task-tip">
                  <Crosshair size={16} />
                  {'Click the real position for ' + (selectedAnchor.name || selectedAnchor.short) + ' on the map, then walk there and bind your current location.'}
                </div>
              )}
              {pageMode === 'map' && placingTask && role === 'uploader' && (
                <div className="setup-tip task-tip">
                  <Plus size={16} />
                  Click the map to place a task. Nearby tasks will stack automatically.
                </div>
              )}

              <TransformWrapper
                minScale={0.8}
                maxScale={5}
                initialScale={1}
                centerOnInit
                limitToBounds
                panning={{ disabled: placingTask }}
                wheel={{ disabled: placingTask }}
                pinch={{ disabled: placingTask }}
                doubleClick={{ disabled: placingTask }}
                onPanningStart={() => setIsMapInteracting(true)}
                onPanningStop={() => setIsMapInteracting(false)}
                onZoomStart={() => setIsMapInteracting(true)}
                onZoomStop={() => setIsMapInteracting(false)}
                onTransformed={(ref) => setMapScale(ref.state.scale)}
              >
                {(utils) => (
                  <>
                    <TransformComponent wrapperClass="map-wrapper" contentClass="map-content">
                      <div
                        className={`map-stage ${isMapInteracting ? 'is-interacting' : ''} ${
                          placingTask ? 'placing-mode' : ''
                        }`}
                      >
                        <div ref={mapImageFrameRef} className="map-image-frame">
                          <img src={bgImage} alt="Campus map" className="map-image" draggable="false" />
                          <div className="map-overlay-tone" />
                          {(pageMode === 'setup' ||
                            (pageMode === 'map' && placingTask && role === 'uploader')) && (
                            <div
                              className={`map-hit-layer ${
                                pageMode === 'setup' ? 'setup-hit-layer' : 'task-hit-layer'
                              }`}
                              onClick={pageMode === 'setup' ? markAnchorOnMap : handleTaskPlacement}
                            >
                              {pageMode === 'setup' && selectedAnchor && selectedAnchor.x == null && (
                                <div className="placement-guide anchor-placement-guide">
                                  <span className="anchor-ring" />
                                  <span className="anchor-core ghost-core">
                                    <Crosshair size={16} strokeWidth={2.1} />
                                  </span>
                                  <span className="anchor-label">
                                    {selectedAnchor.name || (selectedAnchor.short + ' pending')}
                                  </span>
                                </div>
                              )}
                              {pageMode === 'setup' &&
                                selectedAnchor &&
                                selectedAnchor.x != null &&
                                selectedAnchor.y != null &&
                                !currentAnchorReady && (
                                  <div
                                    className="placement-guide setup-focus-marker"
                                    style={{
                                      left: `${selectedAnchor.x}%`,
                                      top: `${selectedAnchor.y}%`,
                                    }}
                                  >
                                    <span className="anchor-ring pending-ring" />
                                    <span className="anchor-core ghost-core pending-core">
                                      <MapPinned size={16} strokeWidth={2} />
                                    </span>
                                    <span className="anchor-label pending-label">
                                      {(selectedAnchor.name || selectedAnchor.short) + ' not confirmed'}
                                    </span>
                                  </div>
                                )}
                              {pageMode === 'map' && placingTask && role === 'uploader' && (
                                <div className="placement-guide task-placement-guide">
                                  <span className="task-marker-core is-stack ghost-task-core">
                                    <Plus size={16} strokeWidth={2.4} />
                                  </span>
                                  <span className="task-marker-label visible-label">Click map to place task</span>
                                </div>
                              )}
                            </div>
                          )}

                          {pageMode === 'setup' &&
                            visibleSetupAnchors.map((anchor) => {
                              const ready = isAnchorReady(anchor);
                              const isSelected = selectedAnchor?.id === anchor.id;
                              const label = ready
                                ? `${anchor.name || anchor.short} ready`
                                : `${anchor.name || anchor.short} pending`;

                              return (
                                <Motion.button
                                  key={anchor.id}
                                  className={`anchor-marker ${isSelected ? 'selected' : ''} ${
                                    ready ? 'ready-marker' : 'pending-marker'
                                  }`}
                                  style={{
                                    left: `${anchor.x}%`,
                                    top: `${anchor.y}%`,
                                    '--marker-scale': mapScale,
                                  }}
                                  initial={{ scale: 0.72, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedAnchorId(anchor.id);
                                  }}
                                >
                                  <span className={`anchor-ring ${ready ? 'ready-ring' : 'pending-ring'}`} />
                                  <span className={`anchor-core ${ready ? 'ready-core' : 'pending-core'}`}>
                                    <MapPinned size={16} strokeWidth={1.9} />
                                  </span>
                                  <span
                                    className={`anchor-label ${ready ? 'ready-label' : 'pending-label'} ${
                                      !ready || isSelected ? 'always-visible' : ''
                                    }`}
                                  >
                                    {label}
                                  </span>
                                </Motion.button>
                              );
                            })}

                        {pageMode === 'map' && liveUserPosition && (
                          <div
                            className="user-location"
                            style={{ left: `${liveUserPosition.x}%`, top: `${liveUserPosition.y}%` }}
                          >
                            {mapHeading != null && (
                              <>
                                <span
                                  className="user-heading-fan"
                                  style={{ transform: `translate(-50%, -50%) rotate(${mapHeading}deg)` }}
                                />
                                <span
                                  className="user-heading-line"
                                  style={{ transform: `translate(-50%, -100%) rotate(${mapHeading}deg)` }}
                                />
                              </>
                            )}
                            <span className="user-pulse" />
                            <span className="user-dot" />
                          </div>
                        )}

                        {pageMode === 'map' &&
                          taskGroups.map((group) => {
                            const primaryTask = group.tasks[0];
                            const tone = getTaskTypeMeta(primaryTask.type).tone;
                            return (
                              <Motion.button
                                key={group.key}
                                className={`task-marker ${selectedStackKey === group.key ? 'selected' : ''}`}
                                style={{
                                  left: `${group.x}%`,
                                  top: `${group.y}%`,
                                  '--marker-scale': mapScale,
                                }}
                                initial={{ scale: 0.72, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedStackKey(group.key);
                                  setSelectedTaskId(group.tasks[0].id);
                                }}
                              >
                                <span
                                  className={`task-marker-core tone-${tone} ${
                                    primaryTask.status === 'completed' ? 'is-complete' : ''
                                  } ${isTaskExpired(primaryTask) ? 'is-expired' : ''} ${
                                    group.tasks.length > 1 ? 'is-stack' : ''
                                  }`}
                                >
                                  {group.tasks.length > 1 ? group.tasks.length : <ListTodo size={14} strokeWidth={2.2} />}
                                </span>
                                <span className="task-marker-label">
                                  {group.tasks.length > 1 ? String(group.tasks.length) + ' tasks' : primaryTask.title}
                                </span>
                              </Motion.button>
                            );
                          })}
                        </div>
                      </div>
                    </TransformComponent>

                    {!hudHidden && (
                      <div className="floating-controls">
                        <button className="icon-glass-btn" onClick={() => utils.zoomIn(0.3)} aria-label="Zoom in">
                          <ZoomIn size={18} />
                        </button>
                        <button className="icon-glass-btn" onClick={() => utils.zoomOut(0.3)} aria-label="Zoom out">
                          <ZoomOut size={18} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </TransformWrapper>
            </div>
          </div>
        )}

        <AnimatePresence>
          {taskDraftPoint && (
            <Motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Motion.div className="sheet-card" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 18, opacity: 0 }}>
                <div className="sheet-head">
                  <div>
                    <span className="eyebrow">{taskDialogMode === 'edit' ? 'Edit Task' : 'Create Task'}</span>
                    <h3>{taskDialogMode === 'edit' ? 'Edit Task' : 'Create Task'}</h3>
                  </div>
                  <button className="icon-ghost" onClick={resetTaskForm}>
                    <X size={18} />
                  </button>
                </div>

                <div className="sheet-body">
                  <label className="field-block">
                    <span>Task title</span>
                    <input
                      value={taskForm.title}
                      onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder='Enter a task title'
                    />
                  </label>
                  <label className="field-block">
                    <span>Task description</span>
                    <textarea
                      rows="4"
                      value={taskForm.description}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, description: event.target.value }))
                      }
                      placeholder='Enter the task details'
                    />
                  </label>
                  <div className="field-block">
                    <span>Task type</span>
                    <div className="type-picker">
                      {TASK_TYPES.map((type) => (
                        <button
                          key={type.id}
                          className={`type-chip ${taskForm.type === type.id ? 'selected' : ''} tone-${type.tone}`}
                          onClick={() => setTaskForm((current) => ({ ...current, type: type.id }))}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="datetime-grid">
                    <label className="field-block">
                      <span>Start time</span>
                      <input
                        type="datetime-local"
                        value={taskForm.startTime}
                        onChange={(event) => setTaskForm((current) => ({ ...current, startTime: event.target.value }))}
                      />
                    </label>
                    <label className="field-block">
                      <span>End time</span>
                      <input
                        type="datetime-local"
                        value={taskForm.endTime}
                        onChange={(event) => setTaskForm((current) => ({ ...current, endTime: event.target.value }))}
                      />
                    </label>
                  </div>
                </div>

                <div className="sheet-actions">
                  <button className="ghost-pill" onClick={resetTaskForm}>
                    Cancel
                  </button>
                  <button className="primary-pill" onClick={submitTask} disabled={!taskForm.title.trim()}>
                    {taskDialogMode === 'edit' ? 'Save changes' : 'Create task'}
                  </button>
                </div>
              </Motion.div>
            </Motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedTask && pageMode === 'map' && (
            <Motion.div className="detail-page-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Motion.aside className="detail-page" initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }}>
                <div className="detail-topbar">
                  <button className="ghost-pill" onClick={() => setSelectedTaskId(null)}>
                    <X size={16} />
                    Close
                  </button>
                  {role === 'uploader' && (
                    <button className="ghost-pill" onClick={() => openTaskEditDialog(selectedTask)}>
                      <PencilLine size={16} />
                      Edit
                    </button>
                  )}
                </div>

                <div className="detail-hero">
                  <div>
                    <span className="eyebrow">Task Detail</span>
                    <h3>{selectedTask.title}</h3>
                    <p>{getTaskTypeMeta(selectedTask.type).label}</p>
                  </div>
                  <span className={`detail-lock ${selectedTask.status === 'completed' ? 'done' : isTaskExpired(selectedTask) ? 'danger' : ''}`}>
                    <CheckCircle2 size={16} />
                    {selectedTask.status === 'completed' ? 'Completed' : isTaskExpired(selectedTask) ? 'Expired' : 'Pending'}
                  </span>
                </div>

                <div className="detail-grid">
                  <div className="detail-card">
                    <span>Created at</span>
                    <strong>{formatDateTime(selectedTask.createdAt)}</strong>
                  </div>
                  <div className="detail-card highlight">
                    <span>Distance from you</span>
                    <strong>{filteredTasks.find((task) => task.id === selectedTask.id)?.distanceLabel || 'Unknown distance'}</strong>
                  </div>
                  <div className="detail-card">
                    <span>Start time</span>
                    <strong>{formatDateTime(selectedTask.startTime)}</strong>
                  </div>
                  <div className="detail-card">
                    <span>End time</span>
                    <strong>{formatDateTime(selectedTask.endTime)}</strong>
                  </div>
                </div>

                <div className="detail-note">
                  <CalendarClock size={16} />
                  <div>{selectedTask.description || 'This task has no detailed description yet.'}</div>
                </div>

                {selectedStack && selectedStack.tasks.length > 1 && (
                  <div className="stack-card">
                    <div className="panel-row">
                      <strong>Tasks at this location</strong>
                      <span className='task-count-chip'>{selectedStack.tasks.length} items</span>
                    </div>
                    <div className="stack-list">
                      {selectedStack.tasks.map((task) => (
                        <button
                          key={task.id}
                          className={`stack-item ${task.id === selectedTask.id ? 'active' : ''}`}
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          <span className={`task-tone-dot tone-${getTaskTypeMeta(task.type).tone}`} />
                          <span className="task-list-copy">
                            <strong>{task.title}</strong>
                            <small>{task.status === 'completed' ? 'Completed' : isTaskExpired(task) ? 'Expired' : 'Pending'}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="panel-actions detail-actions">
                  <button className="primary-pill" onClick={toggleTaskComplete}>
                    <CheckCircle2 size={16} />
                    {selectedTask.status === 'completed' ? 'Mark as pending' : 'Mark as completed'}
                  </button>
                  {role === 'uploader' && (
                    <button className="ghost-pill warning" onClick={deleteTask}>
                      <Trash2 size={16} />
                      Delete task
                    </button>
                  )}
                </div>
              </Motion.aside>
            </Motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default App;
