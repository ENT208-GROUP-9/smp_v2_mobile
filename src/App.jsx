import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AnimatePresence, m } from 'framer-motion';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import {
  CalendarClock,
  CheckCircle2,
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
  { id: 'main', label: '主线任务', tone: 'main' },
  { id: 'side', label: '支线任务', tone: 'side' },
  { id: 'daily', label: '日常任务', tone: 'daily' },
  { id: 'event', label: '活动任务', tone: 'event' },
  { id: 'danger', label: '预警任务', tone: 'danger' },
  { id: 'explore', label: '探索点位', tone: 'explore' },
];

const TASK_SNAP_DISTANCE = 1.6;

function safeReadJson(key, fallback) {
  const saved = localStorage.getItem(key);
  if (!saved) return fallback;

  try {
    return JSON.parse(saved);
  } catch {
    return fallback;
  }
}

function createAnchor(index) {
  return {
    id: `anchor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    short: String(index + 1).padStart(2, '0'),
    x: null,
    y: null,
    lat: null,
    lng: null,
    gpsAccuracy: null,
  };
}

function getNextPendingAnchor(anchors) {
  return anchors.find((anchor) => !anchor.name?.trim() || anchor.x == null || anchor.y == null) || null;
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

function formatDateTime(value) {
  if (!value) return '未设置';
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

  if (Math.abs(vector.x) < 1e-6 && Math.abs(vector.y) < 1e-6) {
    return null;
  }

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
  if (anchors.length === 1) {
    return { x: anchors[0].x, y: anchors[0].y };
  }

  let weightSum = 0;
  let xSum = 0;
  let ySum = 0;

  for (const anchor of anchors) {
    const distance = getDistanceMeters(currentLocation, anchor);
    if (distance < 3) {
      return { x: anchor.x, y: anchor.y };
    }

    const weight = 1 / Math.max(distance, 3) ** 2;
    weightSum += weight;
    xSum += anchor.x * weight;
    ySum += anchor.y * weight;
  }

  if (!weightSum) return null;

  return {
    x: xSum / weightSum,
    y: ySum / weightSum,
  };
}

function getMapDistance(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function getDirectionLabel(targetBearing, heading) {
  if (heading == null) return '地图方向';
  const relative = normalizeDegrees(targetBearing - heading);

  if (relative < 22.5 || relative >= 337.5) return '前方';
  if (relative < 67.5) return '右前方';
  if (relative < 112.5) return '右侧';
  if (relative < 157.5) return '右后方';
  if (relative < 202.5) return '后方';
  if (relative < 247.5) return '左后方';
  if (relative < 292.5) return '左侧';
  return '左前方';
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
  const [anchors, setAnchors] = useState(() => {
    const savedAnchors = safeReadJson(STORAGE_ANCHORS_KEY, []);
    return Array.isArray(savedAnchors) ? savedAnchors : [];
  });
  const [setupComplete, setSetupComplete] = useState(() => localStorage.getItem(STORAGE_SETUP_KEY) === 'true');
  const [mapMeta, setMapMeta] = useState(() => safeReadJson(STORAGE_MAP_META_KEY, null));
  const [selectedAnchorId, setSelectedAnchorId] = useState(() => {
    const savedAnchors = safeReadJson(STORAGE_ANCHORS_KEY, []);
    return getNextPendingAnchor(savedAnchors)?.id ?? savedAnchors[0]?.id ?? null;
  });
  const [tasks, setTasks] = useState(() => {
    const savedTasks = safeReadJson(STORAGE_TASKS_KEY, []);
    return Array.isArray(savedTasks) ? savedTasks : [];
  });
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
    return '当前浏览器不支持指南针。';
  });
  const [userGeo, setUserGeo] = useState(null);
  const [geoStatus, setGeoStatus] = useState(() =>
    typeof navigator === 'undefined' || navigator.geolocation ? 'idle' : 'unsupported',
  );
  const [geoError, setGeoError] = useState(() =>
    typeof navigator === 'undefined' || navigator.geolocation ? '' : '当前浏览器不支持定位。',
  );

  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);

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
    if (mapMeta) {
      localStorage.setItem(STORAGE_MAP_META_KEY, JSON.stringify(mapMeta));
    }
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
        setGeoError(error.message || '无法获取定位。');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [bgImage]);

  useEffect(() => {
    if (!bgImage) return undefined;
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') return undefined;

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
    anchors.find((anchor) => anchor.id === selectedAnchorId) || getNextPendingAnchor(anchors) || anchors[0] || null;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const configuredAnchorCount = anchors.filter((anchor) => anchor.x != null && anchor.y != null).length;
  const geoBoundAnchorCount = anchors.filter(
    (anchor) => typeof anchor.lat === 'number' && typeof anchor.lng === 'number',
  ).length;
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
  const allAnchorsReady = anchors.length > 0 && configuredAnchorCount === anchors.length;
  const pageMode = !bgImage ? 'welcome' : setupComplete ? 'map' : 'setup';

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
        return { ...task, distanceLabel: '未定位', directionLabel: '地图位置', mapDistance: null };
      }

      const mapDistance = getMapDistance(liveUserPosition, task);
      const estimatedMeters = metersPerPercent == null ? null : Math.round(mapDistance * metersPerPercent);
      const directionLabel = getDirectionLabel(getScreenBearing(liveUserPosition, task), mapHeading);

      return {
        ...task,
        mapDistance,
        distanceLabel: estimatedMeters == null ? '未知距离' : `${estimatedMeters} 米`,
        directionLabel,
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

  const taskGroupsMap = new Map();
  for (const task of filteredTasks) {
    const key = getTaskStackKey(task);
    const current = taskGroupsMap.get(key);
    if (current) {
      current.tasks.push(task);
    } else {
      taskGroupsMap.set(key, {
        key,
        x: task.x,
        y: task.y,
        tasks: [task],
      });
    }
  }

  const taskGroups = Array.from(taskGroupsMap.values()).map((group) => ({
    ...group,
    tasks: group.tasks.sort((left, right) => {
      if (left.status === 'completed' && right.status !== 'completed') return 1;
      if (left.status !== 'completed' && right.status === 'completed') return -1;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }),
  }));

  const activeStackKey = selectedTask ? getTaskStackKey(selectedTask) : selectedStackKey;
  const selectedStack = taskGroups.find((group) => group.key === activeStackKey) || null;

  const taskStats = {
    total: tasks.length,
    pending: tasks.filter((task) => task.status !== 'completed' && !isTaskExpired(task)).length,
    expired: tasks.filter((task) => isTaskExpired(task)).length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    stacks: taskGroups.filter((group) => group.tasks.length > 1).length,
  };

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

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

  const handleSetupMapClick = (event) => {
    if (!selectedAnchor) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;

    setAnchors((current) => {
      const next = current.map((anchor) =>
        anchor.id === selectedAnchor.id ? { ...anchor, x, y } : anchor,
      );
      const nextPending = getNextPendingAnchor(next);
      setSelectedAnchorId(nextPending?.id ?? selectedAnchor.id);
      return next;
    });
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

  const resetAnchor = () => {
    if (!selectedAnchor) return;

    setAnchors((current) =>
      current.map((anchor) =>
        anchor.id === selectedAnchor.id
          ? { ...anchor, x: null, y: null, lat: null, lng: null, gpsAccuracy: null }
          : anchor,
      ),
    );
    setSelectedAnchorId(selectedAnchor.id);
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

  const deleteSelectedAnchor = () => {
    if (!selectedAnchor) return;

    setAnchors((current) => {
      const next = current
        .filter((anchor) => anchor.id !== selectedAnchor.id)
        .map((anchor, index) => ({
          ...anchor,
          short: String(index + 1).padStart(2, '0'),
        }));
      setSelectedAnchorId(next[0]?.id ?? null);
      return next;
    });
  };

  const finishSetup = () => {
    if (!allAnchorsReady) return;
    setSetupComplete(true);
    setSelectedAnchorId(null);
  };

  const exportCalibration = () => {
    if (!bgImage || !mapMeta || anchors.length === 0) return;

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

  const handleImportCalibration = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !bgImage || !mapMeta) return;

    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!parsed?.map?.fingerprint || !Array.isArray(parsed?.anchors)) {
      window.alert('导入文件格式不正确。');
      return;
    }

    if (parsed.map.fingerprint !== mapMeta.fingerprint) {
      window.alert('当前底图与导入文件绑定的底图不一致，请先上传相同底图。');
      return;
    }

    const nextAnchors = parsed.anchors.map((anchor, index) => ({
      id: anchor.id || `anchor-import-${index}`,
      name: typeof anchor.name === 'string' ? anchor.name : '',
      short: anchor.short || String(index + 1).padStart(2, '0'),
      x: typeof anchor.x === 'number' ? anchor.x : null,
      y: typeof anchor.y === 'number' ? anchor.y : null,
      lat: typeof anchor.lat === 'number' ? anchor.lat : null,
      lng: typeof anchor.lng === 'number' ? anchor.lng : null,
      gpsAccuracy: typeof anchor.gpsAccuracy === 'number' ? anchor.gpsAccuracy : null,
    }));

    const nextTasks = Array.isArray(parsed.tasks)
      ? parsed.tasks.map((task) => ({
          id: task.id || uuidv4(),
          x: typeof task.x === 'number' ? task.x : 50,
          y: typeof task.y === 'number' ? task.y : 50,
          title: typeof task.title === 'string' ? task.title : '未命名任务',
          description: typeof task.description === 'string' ? task.description : '',
          type: typeof task.type === 'string' ? task.type : 'main',
          status: task.status === 'completed' ? 'completed' : 'pending',
          startTime: task.startTime || null,
          endTime: task.endTime || null,
          createdAt: task.createdAt || new Date().toISOString(),
        }))
      : [];

    setAnchors(nextAnchors);
    setTasks(nextTasks);
    setSetupComplete(Boolean(parsed.setupComplete));
    setSelectedAnchorId(getNextPendingAnchor(nextAnchors)?.id ?? nextAnchors[0]?.id ?? null);
    setSelectedTaskId(null);
    setSelectedStackKey(null);

    if (importInputRef.current) {
      importInputRef.current.value = '';
    }
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

    const bounds = event.currentTarget.getBoundingClientRect();
    const rawPoint = {
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    };
    const snappedPoint = findNearbyTaskPoint(tasks, rawPoint);

    setPlacingTask(false);
    openTaskCreateDialog(snappedPoint);
  };

  const closeTaskDialog = () => {
    resetTaskForm();
  };

  const submitTask = () => {
    if (!taskForm.title.trim() || !taskDraftPoint) return;

    const payload = {
      x: taskDraftPoint.x,
      y: taskDraftPoint.y,
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      type: taskForm.type,
      startTime: taskForm.startTime ? new Date(taskForm.startTime).toISOString() : null,
      endTime: taskForm.endTime ? new Date(taskForm.endTime).toISOString() : null,
    };

    if (taskDialogMode === 'edit' && selectedTask) {
      setTasks((current) =>
        current.map((task) => (task.id === selectedTask.id ? { ...task, ...payload } : task)),
      );
      setSelectedStackKey(getTaskStackKey(payload));
    } else {
      const nextTask = {
        id: uuidv4(),
        ...payload,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      setTasks((current) => [...current, nextTask]);
      setSelectedTaskId(nextTask.id);
      setSelectedStackKey(getTaskStackKey(nextTask));
    }

    closeTaskDialog();
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
      setOrientationError('当前浏览器不支持指南针。');
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
        return;
      }

      setOrientationStatus('denied');
      setOrientationError('指南针权限被拒绝。');
    } catch (error) {
      setOrientationStatus('error');
      setOrientationError(error instanceof Error ? error.message : '指南针权限申请失败。');
    }
  };

  return (
    <div className="app-shell">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleImageUpload}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={handleImportCalibration}
      />

      <div className={`map-surface ${hudHidden ? 'hud-collapsed' : ''}`}>
        <div className="background-glow" />
        <div className="background-noise" />

        <button
          className="hide-toggle"
          onClick={() => setHudHidden((value) => !value)}
          aria-label={hudHidden ? '显示面板' : '隐藏面板'}
        >
          {hudHidden ? <Eye size={16} /> : <EyeOff size={16} />}
          {hudHidden ? '显示' : '隐藏'}
        </button>

        {pageMode === 'welcome' && (
          <div className="welcome-shell">
            <div className="welcome-card">
              <span className="eyebrow">Smart Campus Map</span>
              <h1>先校准地图，再进入在线任务发布与查看</h1>
              <p>
                上传校园底图后，先手动配置锚点和 GPS 校准点。完成后会自动进入任务地图页面，管理员发布任务，用户按实时蓝点位置查看附近任务。
              </p>
              <div className="welcome-actions">
                <button className="primary-pill" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} />
                  上传底图
                </button>
              </div>
            </div>
          </div>
        )}

        {bgImage && (
          <div className={`experience-layout ${pageMode === 'setup' ? 'setup-mode' : 'map-mode'}`}>
            {!hudHidden && (
              <aside className="side-panel">
                <div className="panel-card header-panel">
                  <div className="panel-row">
                    <div>
                      <span className="eyebrow">Workspace</span>
                      <h2>{pageMode === 'setup' ? '锚点配置模式' : '在线任务地图'}</h2>
                    </div>
                    <button
                      className="role-switch"
                      onClick={() => {
                        setRole((current) => (current === 'uploader' ? 'viewer' : 'uploader'));
                        setPlacingTask(false);
                      }}
                    >
                      <Settings2 size={16} />
                      {role === 'uploader' ? '管理员' : '用户端'}
                    </button>
                  </div>
                  <p>
                    {pageMode === 'setup'
                      ? '锚点不做预设，全部由你自己新增、命名、落点并绑定 GPS。'
                      : '完成锚点配置后直接进入任务地图，地图围绕蓝点位置、方向和任务叠层来组织信息。'}
                  </p>
                  <div className="panel-actions compact-actions">
                    <button className="ghost-pill" onClick={() => importInputRef.current?.click()}>
                      <Import size={16} />
                      导入工作区
                    </button>
                    <button className="ghost-pill" onClick={exportCalibration}>
                      <Upload size={16} />
                      导出工作区
                    </button>
                    <button className="ghost-pill" onClick={() => fileInputRef.current?.click()}>
                      <ImageIcon size={16} />
                      更换底图
                    </button>
                    <button className="ghost-pill warning" onClick={clearWorkspace}>
                      <Trash2 size={16} />
                      清空重来
                    </button>
                  </div>
                </div>

                {pageMode === 'setup' ? (
                  <>
                    <div className="panel-card">
                      <span className="eyebrow">Step 1</span>
                      <h3>配置锚点位置</h3>
                      <p>先新增锚点，再命名并点击地图落点。建议至少给两个锚点绑定 GPS，后续蓝点和方向会更准确。</p>
                      <div className="panel-row meter-row">
                        <span>地图落点</span>
                        <strong>
                          {configuredAnchorCount}/{anchors.length}
                        </strong>
                      </div>
                      <div className="panel-row meter-row">
                        <span>GPS 绑定</span>
                        <strong>
                          {geoBoundAnchorCount}/{anchors.length}
                        </strong>
                      </div>
                      <div className="panel-actions compact-actions">
                        <button className="primary-pill" onClick={addAnchor}>
                          <Plus size={16} />
                          新增锚点
                        </button>
                      </div>
                      <div className="anchor-list">
                        {anchors.length === 0 && <div className="empty-inline">还没有锚点，先新增一个。</div>}
                        {anchors.map((anchor) => {
                          const isReady = anchor.x != null && anchor.y != null;
                          const isCurrent = selectedAnchor?.id === anchor.id;

                          return (
                            <button
                              key={anchor.id}
                              className={`anchor-list-item ${isCurrent ? 'active' : ''}`}
                              onClick={() => setSelectedAnchorId(anchor.id)}
                            >
                              <span className="anchor-badge">{anchor.short}</span>
                              <span className="anchor-copy">
                                <strong>{anchor.name || '未命名锚点'}</strong>
                                <small>{isReady ? '已落点，可继续微调' : '待命名或待落点'}</small>
                              </span>
                              <span className={`anchor-state ${isReady ? 'ready' : ''}`}>
                                {isReady ? '已设' : '待设'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="panel-card">
                      <span className="eyebrow">Current</span>
                      <h3>{selectedAnchor?.name || '请选择锚点'}</h3>
                      <p>{selectedAnchor ? '名称、落点和 GPS 绑定都支持重复调整。' : '先新增锚点，再点击地图完成配置。'}</p>
                      {selectedAnchor && (
                        <label className="anchor-name-field">
                          <span>锚点名称</span>
                          <input
                            value={selectedAnchor.name}
                            onChange={(event) => updateAnchorName(selectedAnchor.id, event.target.value)}
                            placeholder="请输入锚点名称"
                          />
                        </label>
                      )}
                      <div className="panel-actions compact-actions">
                        <button
                          className="ghost-pill"
                          onClick={bindSelectedAnchorGps}
                          disabled={!selectedAnchor || !userGeo}
                        >
                          <LocateFixed size={16} />
                          绑定当前位置
                        </button>
                        <button className="ghost-pill" onClick={resetAnchor} disabled={!selectedAnchor}>
                          <RotateCcw size={16} />
                          重设锚点
                        </button>
                        <button
                          className="ghost-pill warning"
                          onClick={deleteSelectedAnchor}
                          disabled={!selectedAnchor}
                        >
                          <Trash2 size={16} />
                          删除锚点
                        </button>
                      </div>
                      {selectedAnchor && (
                        <div className="sensor-note">
                          <span>
                            GPS：
                            {typeof selectedAnchor.lat === 'number' && typeof selectedAnchor.lng === 'number'
                              ? `${selectedAnchor.lat.toFixed(6)}, ${selectedAnchor.lng.toFixed(6)}`
                              : '未绑定'}
                          </span>
                          <span>
                            精度：
                            {typeof selectedAnchor.gpsAccuracy === 'number'
                              ? `${selectedAnchor.gpsAccuracy.toFixed(1)}m`
                              : '--'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="panel-card">
                      <span className="eyebrow">Sensors</span>
                      <h3>定位与指南针</h3>
                      <div className="sensor-note">
                        <span>定位状态：{geoStatus}</span>
                        <span>指南针状态：{orientationStatus}</span>
                      </div>
                      {userGeo && (
                        <div className="sensor-note">
                          <span>
                            当前 GPS：{userGeo.lat.toFixed(6)}, {userGeo.lng.toFixed(6)}
                          </span>
                          <span>定位精度：{userGeo.accuracy.toFixed(1)}m</span>
                        </div>
                      )}
                      {orientationStatus === 'needs-permission' && (
                        <div className="panel-actions compact-actions">
                          <button className="primary-pill" onClick={requestOrientationAccess}>
                            <LocateFixed size={16} />
                            启用指南针
                          </button>
                        </div>
                      )}
                      {(geoError || orientationError) && (
                        <div className="sensor-warning">{geoError || orientationError}</div>
                      )}
                    </div>

                    <div className="panel-actions">
                      <button className="primary-pill" onClick={finishSetup} disabled={!allAnchorsReady}>
                        <MoveRight size={16} />
                        进入任务地图
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="panel-card">
                      <span className="eyebrow">Overview</span>
                      <h3>任务发布与查看</h3>
                      <p>同位置任务自动叠层显示，任务列表按与你的蓝点距离排序，详情面板会显示所在叠层里的其他任务。</p>
                      <div className="stats-grid">
                        <div className="stat-tile">
                          <span>总任务</span>
                          <strong>{taskStats.total}</strong>
                        </div>
                        <div className="stat-tile">
                          <span>进行中</span>
                          <strong>{taskStats.pending}</strong>
                        </div>
                        <div className="stat-tile warning">
                          <span>已超时</span>
                          <strong>{taskStats.expired}</strong>
                        </div>
                        <div className="stat-tile success">
                          <span>叠层点位</span>
                          <strong>{taskStats.stacks}</strong>
                        </div>
                      </div>
                      <div className="panel-actions compact-actions">
                        {orientationStatus === 'needs-permission' && (
                          <button className="ghost-pill" onClick={requestOrientationAccess}>
                            <LocateFixed size={16} />
                            启用指南针
                          </button>
                        )}
                        {role === 'uploader' && (
                          <button
                            className={`primary-pill ${placingTask ? 'placing-active' : ''}`}
                            onClick={() => setPlacingTask((value) => !value)}
                          >
                            {placingTask ? <X size={16} /> : <Plus size={16} />}
                            {placingTask ? '取消投放' : '地图投放任务'}
                          </button>
                        )}
                      </div>
                      <div className="sensor-note">
                        <span>定位：{liveUserPosition ? '已映射到地图' : '待至少绑定 1 个 GPS 锚点'}</span>
                        <span>朝向：{mapHeading == null ? '--' : `${Math.round(mapHeading)}°`}</span>
                      </div>
                      {mapNorthOffset != null && (
                        <div className="sensor-note">
                          <span>地图北向偏角：{Math.round(mapNorthOffset)}°</span>
                          <span>校准锚点：{calibratedAnchors.length}</span>
                        </div>
                      )}
                    </div>

                    <div className="panel-card">
                      <span className="eyebrow">Filters</span>
                      <h3>任务检索</h3>
                      <div className="search-field">
                        <Search size={16} />
                        <input
                          value={taskQuery}
                          onChange={(event) => setTaskQuery(event.target.value)}
                          placeholder="搜索任务名称或描述"
                        />
                      </div>
                      <div className="filter-grid">
                        <label className="select-field">
                          <span>类型</span>
                          <select value={taskTypeFilter} onChange={(event) => setTaskTypeFilter(event.target.value)}>
                            <option value="all">全部类型</option>
                            {TASK_TYPES.map((type) => (
                              <option key={type.id} value={type.id}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="select-field">
                          <span>状态</span>
                          <select value={taskStatusFilter} onChange={(event) => setTaskStatusFilter(event.target.value)}>
                            <option value="all">全部状态</option>
                            <option value="pending">进行中</option>
                            <option value="expired">已超时</option>
                            <option value="completed">已完成</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="panel-card task-list-panel">
                      <div className="panel-row">
                        <div>
                          <span className="eyebrow">Tasks</span>
                          <h3>附近任务列表</h3>
                        </div>
                        <span className="task-count-chip">
                          <Filter size={14} />
                          {filteredTasks.length}
                        </span>
                      </div>
                      <div className="task-list">
                        {filteredTasks.length === 0 && <div className="empty-inline">当前筛选条件下没有任务。</div>}
                        {filteredTasks.map((task) => {
                          const typeMeta = getTaskTypeMeta(task.type);
                          const active = selectedTaskId === task.id;
                          const expired = isTaskExpired(task);
                          const stack = taskGroups.find((group) => group.key === getTaskStackKey(task));

                          return (
                            <button
                              key={task.id}
                              className={`task-list-item ${active ? 'active' : ''}`}
                              onClick={() => {
                                setSelectedTaskId(task.id);
                                setSelectedStackKey(getTaskStackKey(task));
                              }}
                            >
                              <span className={`task-tone-dot tone-${typeMeta.tone}`} />
                              <span className="task-list-copy">
                                <strong>{task.title}</strong>
                                <small>
                                  {typeMeta.label} · {task.directionLabel} · {task.distanceLabel}
                                </small>
                              </span>
                              <span className={`task-status-chip ${task.status} ${expired ? 'expired' : ''}`}>
                                {stack && stack.tasks.length > 1 ? `${stack.tasks.length} 项叠层` : expired ? '已超时' : task.status === 'completed' ? '已完成' : '进行中'}
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
              {placingTask && pageMode === 'map' && role === 'uploader' && (
                <div className="setup-tip task-tip">
                  <Plus size={16} />
                  点击地图投放任务；靠近已有任务时会自动叠到同一位置
                </div>
              )}

              <TransformWrapper
                minScale={0.8}
                maxScale={5}
                initialScale={1}
                centerOnInit
                limitToBounds
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
                        onClick={pageMode === 'setup' ? handleSetupMapClick : handleTaskPlacement}
                      >
                        <img src={bgImage} alt="Campus map" className="map-image" draggable="false" />
                        <div className="map-overlay-tone" />

                        {pageMode === 'setup' &&
                          anchors
                            .filter((anchor) => anchor.x != null && anchor.y != null)
                            .map((anchor) => (
                              <Motion.button
                                key={anchor.id}
                                className={`anchor-marker ${selectedAnchor?.id === anchor.id ? 'selected' : ''}`}
                                style={{
                                  left: `${anchor.x}%`,
                                  top: `${anchor.y}%`,
                                  '--marker-scale': mapScale,
                                }}
                                initial={{ scale: 0.72, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedAnchorId(anchor.id);
                                }}
                              >
                                <span className="anchor-ring" />
                                <span className="anchor-core">
                                  <MapPinned size={16} strokeWidth={1.9} />
                                </span>
                                <span className="anchor-label">{anchor.name || '未命名锚点'}</span>
                              </Motion.button>
                            ))}

                        {pageMode === 'setup' && selectedAnchor && (
                          <div className="setup-tip">
                            <ShieldCheck size={16} />
                            当前正在配置：{selectedAnchor.name || selectedAnchor.short}
                          </div>
                        )}

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
                            const typeMeta = getTaskTypeMeta(primaryTask.type);
                            const stackSelected = selectedStackKey === group.key;

                            return (
                              <Motion.button
                                key={group.key}
                                className={`task-marker ${stackSelected ? 'selected' : ''}`}
                                style={{
                                  left: `${group.x}%`,
                                  top: `${group.y}%`,
                                  '--marker-scale': mapScale,
                                }}
                                initial={{ scale: 0.72, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 280, damping: 18 }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedStackKey(group.key);
                                  setSelectedTaskId(group.tasks[0].id);
                                }}
                              >
                                <span
                                  className={`task-marker-core tone-${typeMeta.tone} ${
                                    primaryTask.status === 'completed' ? 'is-complete' : ''
                                  } ${isTaskExpired(primaryTask) ? 'is-expired' : ''} ${
                                    group.tasks.length > 1 ? 'is-stack' : ''
                                  }`}
                                >
                                  {group.tasks.length > 1 ? group.tasks.length : <ListTodo size={14} strokeWidth={2.2} />}
                                </span>
                                <span className="task-marker-label">
                                  {group.tasks.length > 1 ? `${group.tasks.length} 个任务叠层` : primaryTask.title}
                                </span>
                              </Motion.button>
                            );
                          })}
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
            <Motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Motion.div
                className="sheet-card"
                initial={{ y: 18, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 18, opacity: 0, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
              >
                <div className="sheet-head">
                  <div>
                    <span className="eyebrow">{taskDialogMode === 'edit' ? 'Edit Task' : 'Create Task'}</span>
                    <h3>{taskDialogMode === 'edit' ? '编辑地图任务' : '新建地图任务'}</h3>
                  </div>
                  <button className="icon-ghost" onClick={closeTaskDialog}>
                    <X size={18} />
                  </button>
                </div>

                <div className="sheet-body">
                  <label className="field-block">
                    <span>任务名称</span>
                    <input
                      value={taskForm.title}
                      onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="例如：图书馆签到、社团招新、失物招领"
                    />
                  </label>

                  <label className="field-block">
                    <span>任务说明</span>
                    <textarea
                      rows="4"
                      value={taskForm.description}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, description: event.target.value }))
                      }
                      placeholder="补充任务要求、奖励、参与方式或时间提醒"
                    />
                  </label>

                  <div className="field-block">
                    <span>任务类型</span>
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
                      <span>开始时间</span>
                      <input
                        type="datetime-local"
                        value={taskForm.startTime}
                        onChange={(event) =>
                          setTaskForm((current) => ({ ...current, startTime: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field-block">
                      <span>结束时间</span>
                      <input
                        type="datetime-local"
                        value={taskForm.endTime}
                        onChange={(event) =>
                          setTaskForm((current) => ({ ...current, endTime: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                </div>

                <div className="sheet-actions">
                  <button className="ghost-pill" onClick={closeTaskDialog}>
                    取消
                  </button>
                  <button className="primary-pill" onClick={submitTask} disabled={!taskForm.title.trim()}>
                    {taskDialogMode === 'edit' ? '保存修改' : '完成投放'}
                  </button>
                </div>
              </Motion.div>
            </Motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedTask && pageMode === 'map' && (
            <Motion.div
              className="detail-page-wrap"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Motion.aside
                className="detail-page"
                initial={{ x: 24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 24, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              >
                <div className="detail-topbar">
                  <button className="ghost-pill" onClick={() => setSelectedTaskId(null)}>
                    <X size={16} />
                    关闭
                  </button>
                  {role === 'uploader' && (
                    <button className="ghost-pill" onClick={() => openTaskEditDialog(selectedTask)}>
                      <PencilLine size={16} />
                      编辑
                    </button>
                  )}
                </div>

                <div className="detail-hero">
                  <div>
                    <span className="eyebrow">Task Detail</span>
                    <h3>{selectedTask.title}</h3>
                    <p>{getTaskTypeMeta(selectedTask.type).label}</p>
                  </div>
                  <span
                    className={`detail-lock ${
                      selectedTask.status === 'completed'
                        ? 'done'
                        : isTaskExpired(selectedTask)
                          ? 'danger'
                          : ''
                    }`}
                  >
                    <CheckCircle2 size={16} />
                    {selectedTask.status === 'completed'
                      ? '已完成'
                      : isTaskExpired(selectedTask)
                        ? '已超时'
                        : '进行中'}
                  </span>
                </div>

                <div className="detail-grid">
                  <div className="detail-card">
                    <span>创建时间</span>
                    <strong>{formatDateTime(selectedTask.createdAt)}</strong>
                  </div>
                  <div className="detail-card highlight">
                    <span>与你的位置</span>
                    <strong>
                      {filteredTasks.find((task) => task.id === selectedTask.id)?.distanceLabel || '未知距离'}
                    </strong>
                  </div>
                  <div className="detail-card">
                    <span>开始时间</span>
                    <strong>{formatDateTime(selectedTask.startTime)}</strong>
                  </div>
                  <div className="detail-card">
                    <span>结束时间</span>
                    <strong>{formatDateTime(selectedTask.endTime)}</strong>
                  </div>
                </div>

                <div className="detail-note">
                  <CalendarClock size={16} />
                  <div>{selectedTask.description || '当前任务未填写详细说明。'}</div>
                </div>

                {selectedStack && selectedStack.tasks.length > 1 && (
                  <div className="stack-card">
                    <div className="panel-row">
                      <strong>同地点任务</strong>
                      <span className="task-count-chip">{selectedStack.tasks.length} 项</span>
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
                            <small>{task.status === 'completed' ? '已完成' : isTaskExpired(task) ? '已超时' : '进行中'}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="panel-actions detail-actions">
                  <button className="primary-pill" onClick={toggleTaskComplete}>
                    <CheckCircle2 size={16} />
                    {selectedTask.status === 'completed' ? '恢复为进行中' : '标记完成'}
                  </button>
                  {role === 'uploader' && (
                    <button className="ghost-pill warning" onClick={deleteTask}>
                      <Trash2 size={16} />
                      删除任务
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
