import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AnimatePresence, m } from 'framer-motion';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import {
  CheckCircle2,
  Compass,
  Crosshair,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Import,
  Layers3,
  LocateFixed,
  MapPinned,
  Navigation,
  PencilLine,
  Plus,
  Radar,
  RefreshCcw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  createCalibration,
  getDistanceMeters,
  getMapDistance,
  getScreenBearing,
  getScreenNorthBearing,
  normalizeDegrees,
  projectLocationToMap,
} from './lib/geo';

const Motion = m;
const APP_VARIANT = import.meta.env.VITE_APP_VARIANT === 'mobile' ? 'mobile' : 'desktop';

const STORAGE_MAP_KEY = 'campus-map-base-image';
const STORAGE_ANCHORS_KEY = 'campus-map-anchors';
const STORAGE_SETUP_KEY = 'campus-map-setup-complete';
const STORAGE_MAP_META_KEY = 'campus-map-meta';
const STORAGE_TASKS_KEY = 'campus-map-tasks';

const TASK_TYPES = [
  { id: 'main', label: 'Main Route', tone: 'main' },
  { id: 'checkpoint', label: 'Checkpoint', tone: 'checkpoint' },
  { id: 'alert', label: 'Alert', tone: 'alert' },
  { id: 'event', label: 'Event', tone: 'event' },
  { id: 'note', label: 'Note', tone: 'note' },
  { id: 'explore', label: 'Explore', tone: 'explore' },
];

const TASK_SNAP_DISTANCE = 1.35;
const GEO_SAMPLE_WINDOW_MS = 12000;
const GEO_SAMPLE_LIMIT = 16;

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
    sampleCount: 0,
  };
}

function createDefaultTaskForm() {
  return {
    title: '',
    description: '',
    type: 'main',
    startTime: '',
    endTime: '',
  };
}

function isAnchorReady(anchor) {
  return Boolean(
    anchor &&
      anchor.name?.trim() &&
      anchor.x != null &&
      anchor.y != null &&
      typeof anchor.lat === 'number' &&
      typeof anchor.lng === 'number',
  );
}

function getNextPendingAnchor(anchors) {
  return anchors.find((anchor) => !isAnchorReady(anchor)) || null;
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

function getRelativePoint(event) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * 100,
    y: ((event.clientY - bounds.top) / bounds.height) * 100,
  };
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

function getDirectionLabel(targetBearing, heading) {
  if (heading == null) return 'Map direction';
  const relative = normalizeDegrees(targetBearing - heading);
  if (relative < 22.5 || relative >= 337.5) return 'Ahead';
  if (relative < 67.5) return 'Front-right';
  if (relative < 112.5) return 'Right';
  if (relative < 157.5) return 'Back-right';
  if (relative < 202.5) return 'Behind';
  if (relative < 247.5) return 'Back-left';
  if (relative < 292.5) return 'Left';
  return 'Front-left';
}

function summarizeGeoSamples(samples) {
  if (!samples || samples.length === 0) return null;
  let totalWeight = 0;
  let latSum = 0;
  let lngSum = 0;
  let accuracySum = 0;

  for (const sample of samples) {
    const weight = 1 / Math.max(sample.accuracy, 4) ** 2;
    totalWeight += weight;
    latSum += sample.lat * weight;
    lngSum += sample.lng * weight;
    accuracySum += sample.accuracy * weight;
  }

  return {
    lat: latSum / totalWeight,
    lng: lngSum / totalWeight,
    accuracy: accuracySum / totalWeight,
    sampleCount: samples.length,
  };
}

function getAccuracyLabel(accuracy) {
  if (accuracy == null) return 'No GPS';
  if (accuracy <= 6) return 'Excellent';
  if (accuracy <= 12) return 'Good';
  if (accuracy <= 20) return 'Usable';
  return 'Weak';
}

function getCalibrationLabel(calibration, anchorCount) {
  if (anchorCount < 2) return 'Need at least 2 anchors';
  if (!calibration) return 'Waiting for calibration';
  if (anchorCount < 4) return '3 anchors work, 4-6 are better';
  if (calibration.meanResidual <= 1.2) return 'Very stable';
  if (calibration.meanResidual <= 2.5) return 'Stable';
  if (calibration.meanResidual <= 4) return 'Check a few anchors';
  return 'Recalibration recommended';
}

function getCalibrationHint(calibration, anchorCount) {
  if (anchorCount < 2) return '至少绑定两个点，地图才能开始拟合。';
  if (anchorCount < 4)
    return '三点已经可用，但为了减少透视误差和边缘漂移，建议扩展到 4 到 6 个分散锚点。';
  if (!calibration) return '校准尚未完成。';
  if (calibration.meanResidual <= 1.2)
    return '当前拟合误差很低，蓝点可以走出锚点三角形范围，不会再被强行锁在内部。';
  if (calibration.meanResidual <= 3)
    return '地图已经可用，若要进一步提高精度，优先重绑误差大的锚点并在校园边界再补几个点。';
  return '拟合误差偏高，常见原因是底图比例不均或锚点 GPS 采样太少，建议重绑。';
}

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'desktop';
  const userAgent = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

function getPermissionGuide(platform) {
  if (platform === 'ios') {
    return 'iPhone 上请点地址栏左侧权限图标，确保位置为 Allow，并在首次进入时同意指南针权限。';
  }
  if (platform === 'android') {
    return 'Android 上请确认浏览器站点权限为 Allow，并关闭省电模式或后台定位限制。';
  }
  return '桌面浏览器上请点地址栏的位置图标，将当前站点的 Location 设置为 Allow。';
}

function getAnchorQuality(anchor) {
  if (!anchor) return { label: 'Missing', tone: 'pending' };
  if (!isAnchorReady(anchor)) return { label: 'Pending', tone: 'pending' };
  if ((anchor.sampleCount ?? 0) >= 6 && (anchor.gpsAccuracy ?? 99) <= 10) {
    return { label: 'Strong', tone: 'ready' };
  }
  if ((anchor.sampleCount ?? 0) >= 3 && (anchor.gpsAccuracy ?? 99) <= 18) {
    return { label: 'Usable', tone: 'mid' };
  }
  return { label: 'Weak', tone: 'weak' };
}

function getAnchorSpreadHint(anchors) {
  if (anchors.length < 2) return '锚点太少，先把校园里至少两个真实点绑上。';

  let maxDistance = 0;
  let minDistance = Infinity;

  for (let index = 0; index < anchors.length; index += 1) {
    for (let pairIndex = index + 1; pairIndex < anchors.length; pairIndex += 1) {
      const distance = getDistanceMeters(anchors[index], anchors[pairIndex]);
      maxDistance = Math.max(maxDistance, distance);
      minDistance = Math.min(minDistance, distance);
    }
  }

  if (maxDistance < 35) {
    return '锚点分布还太集中，建议把点位拉到目标区域边界和角落，外推会更稳。';
  }
  if (minDistance < 8) {
    return '有两个锚点非常接近，信息量偏低，最好换成更分散的真实位置。';
  }
  if (anchors.length < 4) {
    return '当前分布已经能用，但再补 1 到 2 个边界锚点，移动范围会更稳。';
  }
  return '锚点分布比较健康，适合实地连续行走测试。';
}

function getAnchorProgress(anchor) {
  if (!anchor) {
    return {
      step: 1,
      title: 'Create an anchor',
      action: 'Add anchor',
      detail: '先创建一个锚点，然后在地图上标出它的位置。',
      mapHint: '点击左侧 Add anchor 开始',
      mapTone: 'pending',
    };
  }

  const hasMapPoint = anchor.x != null && anchor.y != null;
  const hasGps = typeof anchor.lat === 'number' && typeof anchor.lng === 'number';

  if (!hasMapPoint) {
    return {
      step: 1,
      title: 'Step 1: click this point on the map',
      action: 'Click map point',
      detail: '先在右侧底图上点出这个锚点的图片位置。',
      mapHint: '下一步：在图上点这个锚点的位置',
      mapTone: 'pending',
    };
  }

  if (!hasGps) {
    return {
      step: 2,
      title: 'Step 2: stand there and bind GPS',
      action: 'Bind GPS',
      detail: '走到现实中的同一个地点，停留几秒，再绑定平均 GPS。',
      mapHint: '地图点已放好，下一步绑定 GPS',
      mapTone: 'gps',
    };
  }

  return {
    step: 3,
    title: 'Step 3: confirm and move on',
    action: 'Confirm',
    detail: '这个锚点已经有地图点和 GPS，可以确认并继续下一个。',
    mapHint: '这个锚点已完成，可以确认',
    mapTone: 'ready',
  };
}

function getChecklistItems({
  bgImage,
  geoPermission,
  geoStatus,
  readyAnchors,
  currentLocation,
  calibration,
}) {
  return [
    {
      label: '底图已导入',
      done: Boolean(bgImage),
      detail: bgImage ? '可以开始锚点标定' : '先上传校园底图',
    },
    {
      label: '定位权限',
      done: geoPermission === 'granted' || geoStatus === 'active',
      detail:
        geoPermission === 'granted' || geoStatus === 'active'
          ? '浏览器已允许高精度定位'
          : '需要在浏览器里允许位置访问',
    },
    {
      label: '锚点数量',
      done: readyAnchors.length >= 4,
      detail:
        readyAnchors.length >= 4
          ? `${readyAnchors.length} 个锚点，覆盖度较好`
          : `${readyAnchors.length} 个已就绪，建议至少 4 个`,
    },
    {
      label: '实时精度',
      done: Boolean(currentLocation && currentLocation.accuracy <= 12),
      detail: currentLocation
        ? `${currentLocation.accuracy.toFixed(1)}m`
        : '等待实时 GPS',
    },
    {
      label: '地图拟合',
      done: Boolean(calibration && calibration.meanResidual <= 3),
      detail: calibration ? `残差 ${calibration.meanResidual.toFixed(2)}%` : '等待校准',
    },
  ];
}

function formatGeoTimeoutMessage() {
  return 'GPS response is slow. Stay still for a few seconds, move toward an open area, then refresh again.';
}

function SectionCard({ title, eyebrow, children, className = '' }) {
  return (
    <section className={`panel-card ${className}`.trim()}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}

function TopStat({ label, value, tone = 'default' }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TaskModal({
  mode,
  form,
  setForm,
  onClose,
  onSubmit,
}) {
  return (
    <AnimatePresence>
      <Motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <Motion.div
          className="sheet-card"
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 18, opacity: 0 }}
        >
          <div className="sheet-head">
            <div>
              <span className="eyebrow">{mode === 'edit' ? 'Edit Task' : 'Create Task'}</span>
              <h3>{mode === 'edit' ? 'Update the marker content' : 'Publish a new map point'}</h3>
            </div>
            <button className="icon-ghost" onClick={onClose} aria-label="Close task modal">
              <X size={18} />
            </button>
          </div>

          <label className="field-block">
            <span>Title</span>
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="e.g. North Gate pickup point"
            />
          </label>

          <label className="field-block">
            <span>Description</span>
            <textarea
              rows={4}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Tell teammates what should happen at this location."
            />
          </label>

          <div className="field-grid">
            <label className="field-block">
              <span>Type</span>
              <select
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
              >
                {TASK_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-block">
              <span>Start</span>
              <input
                type="datetime-local"
                value={form.startTime}
                onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
              />
            </label>
          </div>

          <label className="field-block">
            <span>End</span>
            <input
              type="datetime-local"
              value={form.endTime}
              onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
            />
          </label>

          <div className="sheet-actions">
            <button className="ghost-pill" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-pill" onClick={onSubmit} disabled={!form.title.trim()}>
              <CheckCircle2 size={16} />
              {mode === 'edit' ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}

function App() {
  const [bgImage, setBgImage] = useState(() => localStorage.getItem(STORAGE_MAP_KEY));
  const [anchors, setAnchors] = useState(() => safeReadJson(STORAGE_ANCHORS_KEY, []));
  const [tasks, setTasks] = useState(() => safeReadJson(STORAGE_TASKS_KEY, []));
  const [setupComplete, setSetupComplete] = useState(
    () => localStorage.getItem(STORAGE_SETUP_KEY) === 'true',
  );
  const [mapMeta, setMapMeta] = useState(() => safeReadJson(STORAGE_MAP_META_KEY, null));
  const [selectedAnchorId, setSelectedAnchorId] = useState(() => {
    const savedAnchors = safeReadJson(STORAGE_ANCHORS_KEY, []);
    return getNextPendingAnchor(savedAnchors)?.id ?? savedAnchors[0]?.id ?? null;
  });
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedStackKey, setSelectedStackKey] = useState(null);
  const [taskQuery, setTaskQuery] = useState('');
  const [taskTypeFilter, setTaskTypeFilter] = useState('all');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [role, setRole] = useState('viewer');
  const [placingTask, setPlacingTask] = useState(false);
  const [taskDraftPoint, setTaskDraftPoint] = useState(null);
  const [taskDialogMode, setTaskDialogMode] = useState('create');
  const [taskForm, setTaskForm] = useState(createDefaultTaskForm);
  const [hudHidden, setHudHidden] = useState(false);
  const [sheetSection, setSheetSection] = useState('anchors');
  const [sheetExpanded, setSheetExpanded] = useState(APP_VARIANT === 'mobile');
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );
  const [mapScale, setMapScale] = useState(1);

  const [currentLocation, setCurrentLocation] = useState(null);
  const [geoHistory, setGeoHistory] = useState([]);
  const [geoPermission, setGeoPermission] = useState('unknown');
  const [geoStatus, setGeoStatus] = useState(() =>
    typeof navigator === 'undefined' || navigator.geolocation ? 'idle' : 'unsupported',
  );
  const [geoError, setGeoError] = useState(() =>
    typeof navigator === 'undefined' || navigator.geolocation
      ? ''
      : 'Geolocation is not supported in this browser.',
  );

  const [deviceHeading, setDeviceHeading] = useState(null);
  const [orientationGranted, setOrientationGranted] = useState(false);
  const [orientationStatus, setOrientationStatus] = useState(() => {
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      return 'unsupported';
    }
    return typeof window.DeviceOrientationEvent.requestPermission === 'function'
      ? 'needs-permission'
      : 'idle';
  });
  const [orientationError, setOrientationError] = useState('');
  const platform = useMemo(() => detectPlatform(), []);

  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);
  const currentLocationRef = useRef(null);

  const compactLayout = APP_VARIANT === 'mobile' || viewportWidth < 980;
  const pageMode = !bgImage ? 'welcome' : setupComplete ? 'map' : 'setup';

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    } else {
      localStorage.removeItem(STORAGE_MAP_META_KEY);
    }
  }, [mapMeta]);

  useEffect(() => {
    if (pageMode === 'setup') {
      setSheetSection('anchors');
    } else if (pageMode === 'map' && sheetSection === 'anchors') {
      setSheetSection('tasks');
    }
  }, [pageMode, sheetSection]);

  useEffect(() => {
    if (!navigator?.permissions?.query) return undefined;
    let mounted = true;
    let permissionStatus = null;

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (!mounted) return;
        permissionStatus = status;
        setGeoPermission(status.state);
        status.onchange = () => setGeoPermission(status.state);
      })
      .catch(() => {
        setGeoPermission('unknown');
      });

    return () => {
      mounted = false;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, []);

  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  useEffect(() => {
    if (!bgImage || !navigator.geolocation) return undefined;

    setGeoStatus('requesting');
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
        setGeoHistory((current) =>
          [...current, sample]
            .filter((item) => sample.timestamp - item.timestamp <= GEO_SAMPLE_WINDOW_MS)
            .slice(-GEO_SAMPLE_LIMIT),
        );
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
        setGeoError(isTimeout ? formatGeoTimeoutMessage() : error.message || 'Unable to get location.');
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 25000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [bgImage]);

  useEffect(() => {
    if (!bgImage || typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
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
      setDeviceHeading(nextHeading);
      setOrientationStatus('active');
      setOrientationError('');
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [bgImage, orientationGranted]);

  const readyAnchors = useMemo(
    () => anchors.filter((anchor) => isAnchorReady(anchor)),
    [anchors],
  );
  const calibration = useMemo(() => createCalibration(readyAnchors), [readyAnchors]);
  const screenNorthBearing = useMemo(() => getScreenNorthBearing(calibration), [calibration]);
  const rawHeading = currentLocation?.heading ?? deviceHeading;
  const mapHeading =
    rawHeading == null || screenNorthBearing == null
      ? rawHeading
      : normalizeDegrees(screenNorthBearing + rawHeading);

  const liveMapPointRaw = useMemo(
    () => projectLocationToMap(currentLocation, readyAnchors, calibration),
    [currentLocation, readyAnchors, calibration],
  );
  const [liveMapPoint, setLiveMapPoint] = useState(null);

  useEffect(() => {
    if (!liveMapPointRaw) {
      setLiveMapPoint(null);
      return;
    }

    setLiveMapPoint((previous) => {
      if (!previous) return liveMapPointRaw;
      const alpha = currentLocation?.accuracy && currentLocation.accuracy <= 10 ? 0.42 : 0.24;
      return {
        x: previous.x + (liveMapPointRaw.x - previous.x) * alpha,
        y: previous.y + (liveMapPointRaw.y - previous.y) * alpha,
      };
    });
  }, [liveMapPointRaw, currentLocation?.accuracy]);

  const recentAnchorSamples = useMemo(() => {
    const cutoff = Date.now() - GEO_SAMPLE_WINDOW_MS;
    return geoHistory.filter((sample) => sample.timestamp >= cutoff && sample.accuracy <= 35);
  }, [geoHistory]);
  const anchorSampleSummary = useMemo(
    () => summarizeGeoSamples(recentAnchorSamples),
    [recentAnchorSamples],
  );

  const selectedAnchor =
    anchors.find((anchor) => anchor.id === selectedAnchorId) ||
    getNextPendingAnchor(anchors) ||
    anchors[0] ||
    null;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        const query = taskQuery.trim().toLowerCase();
        const matchesQuery =
          query.length === 0 ||
          task.title.toLowerCase().includes(query) ||
          task.description.toLowerCase().includes(query);

        const matchesType = taskTypeFilter === 'all' || task.type === taskTypeFilter;
        const taskStatus =
          task.status === 'completed' ? 'completed' : isTaskExpired(task) ? 'expired' : 'pending';
        const matchesStatus = taskStatusFilter === 'all' || taskStatus === taskStatusFilter;

        return matchesQuery && matchesType && matchesStatus;
      })
      .map((task) => {
        if (!liveMapPoint) {
          return {
            ...task,
            mapDistance: null,
            distanceLabel: 'Waiting for live position',
            directionLabel: 'Map direction',
          };
        }
        const mapDistance = getMapDistance(liveMapPoint, task);
        const estimatedMeters =
          calibration?.metersPerPercent == null
            ? null
            : Math.round(mapDistance * calibration.metersPerPercent);

        return {
          ...task,
          mapDistance,
          distanceLabel:
            estimatedMeters == null ? 'Distance unavailable' : `${estimatedMeters} m`,
          directionLabel: getDirectionLabel(getScreenBearing(liveMapPoint, task), mapHeading),
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
  }, [tasks, taskQuery, taskTypeFilter, taskStatusFilter, liveMapPoint, calibration, mapHeading]);

  const taskGroups = useMemo(() => {
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
    return Array.from(groupMap.values());
  }, [filteredTasks]);

  const resetTaskForm = () => {
    setTaskForm(createDefaultTaskForm());
    setTaskDraftPoint(null);
    setTaskDialogMode('create');
  };

  const requestLocationRefresh = () => {
    if (!navigator.geolocation) {
      setGeoStatus('unsupported');
      setGeoError('Geolocation is not supported in this browser.');
      return;
    }

    setGeoStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      () => setGeoStatus('active'),
      (error) => {
        const isTimeout = error?.code === 3;
        if (isTimeout && currentLocationRef.current) {
          setGeoStatus('active');
          setGeoError('');
          return;
        }

        setGeoStatus('error');
        setGeoError(
          isTimeout ? formatGeoTimeoutMessage() : error.message || 'Unable to request location access.',
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const requestOrientationAccess = async () => {
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      setOrientationStatus('unsupported');
      setOrientationError('Compass is not supported in this browser.');
      return;
    }
    const orientationEvent = window.DeviceOrientationEvent;
    if (typeof orientationEvent.requestPermission !== 'function') {
      setOrientationGranted(true);
      setOrientationStatus('idle');
      return;
    }

    try {
      const result = await orientationEvent.requestPermission();
      if (result === 'granted') {
        setOrientationGranted(true);
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
      setAnchors([]);
      setTasks([]);
      setSetupComplete(false);
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
    setGeoHistory([]);
    setCurrentLocation(null);
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

  const markAnchorOnMap = (event) => {
    if (!selectedAnchor || pageMode !== 'setup') return;
    const point = getRelativePoint(event);
    setAnchors((current) =>
      current.map((anchor) => (anchor.id === selectedAnchor.id ? { ...anchor, ...point } : anchor)),
    );
  };

  const bindSelectedAnchorGps = () => {
    if (!selectedAnchor) return;
    const summary =
      anchorSampleSummary ||
      (currentLocation
        ? {
            lat: currentLocation.lat,
            lng: currentLocation.lng,
            accuracy: currentLocation.accuracy,
            sampleCount: 1,
          }
        : null);

    if (!summary) return;

    setAnchors((current) =>
      current.map((anchor) =>
        anchor.id === selectedAnchor.id
          ? {
              ...anchor,
              lat: summary.lat,
              lng: summary.lng,
              gpsAccuracy: summary.accuracy,
              sampleCount: summary.sampleCount,
            }
          : anchor,
      ),
    );
  };

  const resetAnchor = () => {
    if (!selectedAnchor) return;
    setAnchors((current) =>
      current.map((anchor) =>
        anchor.id === selectedAnchor.id
          ? { ...anchor, x: null, y: null, lat: null, lng: null, gpsAccuracy: null, sampleCount: 0 }
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

  const confirmCurrentAnchor = () => {
    if (!selectedAnchor || !isAnchorReady(selectedAnchor)) return;
    const nextPending = getNextPendingAnchor(anchors.filter((anchor) => anchor.id !== selectedAnchor.id));
    if (nextPending) {
      setSelectedAnchorId(nextPending.id);
      return;
    }
    setSetupComplete(true);
    setSelectedAnchorId(null);
    setSheetSection('tasks');
  };

  const reopenAnchorSetup = () => {
    if (anchors.length === 0) {
      addAnchor();
    } else {
      setSelectedAnchorId(getNextPendingAnchor(anchors)?.id ?? anchors[0]?.id ?? null);
    }
    setSetupComplete(false);
    setPlacingTask(false);
    setSheetSection('anchors');
  };

  const exportWorkspace = () => {
    if (!bgImage || !mapMeta) return;
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      map: mapMeta,
      anchors,
      tasks,
      setupComplete,
      variant: APP_VARIANT,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'smp-workspace.json';
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
    setSheetSection(Boolean(parsed.setupComplete) ? 'tasks' : 'anchors');

    if (importInputRef.current) importInputRef.current.value = '';
  };

  const openTaskCreateDialog = (point) => {
    setTaskDialogMode('create');
    setTaskDraftPoint(point);
    setTaskForm(createDefaultTaskForm());
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
    const point = findNearbyTaskPoint(tasks, getRelativePoint(event));
    setPlacingTask(false);
    openTaskCreateDialog(point);
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

  const selectedAnchorReady = selectedAnchor ? isAnchorReady(selectedAnchor) : false;
  const permissionGuide = useMemo(() => getPermissionGuide(platform), [platform]);
  const checklistItems = useMemo(
    () =>
      getChecklistItems({
        bgImage,
        geoPermission,
        geoStatus,
        readyAnchors,
        currentLocation,
        calibration,
      }),
    [bgImage, geoPermission, geoStatus, readyAnchors, currentLocation, calibration],
  );
  const anchorSpreadHint = useMemo(() => getAnchorSpreadHint(readyAnchors), [readyAnchors]);
  const selectedAnchorProgress = useMemo(() => getAnchorProgress(selectedAnchor), [selectedAnchor]);

  const desktopPanel = (
    <aside className="side-panel">
      <SectionCard eyebrow="Workspace" title={pageMode === 'setup' ? 'Anchor Studio' : 'Smart Position Map'}>
        <div className="toolbar-row">
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

        <div className="action-grid">
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
      </SectionCard>

      <SectionCard eyebrow="Calibration" title="Map health">
        <div className="stats-grid">
          <TopStat label="Ready anchors" value={readyAnchors.length} tone="blue" />
          <TopStat
            label="Mean residual"
            value={calibration ? `${calibration.meanResidual.toFixed(2)}%` : '--'}
            tone="gold"
          />
          <TopStat
            label="Model"
            value={calibration ? calibration.model : 'none'}
            tone="green"
          />
          <TopStat
            label="GPS accuracy"
            value={currentLocation ? `${currentLocation.accuracy.toFixed(1)}m` : '--'}
            tone="pink"
          />
        </div>
        <div className="status-banner">
          <ShieldCheck size={16} />
          <div>
            <strong>{getCalibrationLabel(calibration, readyAnchors.length)}</strong>
            <p>{getCalibrationHint(calibration, readyAnchors.length)}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard eyebrow="Sensors" title="Permission and signal">
        <div className="sensor-grid">
          <div className="sensor-chip">
            <span>Location</span>
            <strong>{geoStatus}</strong>
          </div>
          <div className="sensor-chip">
            <span>Permission</span>
            <strong>{geoPermission}</strong>
          </div>
          <div className="sensor-chip">
            <span>Compass</span>
            <strong>{orientationStatus}</strong>
          </div>
          <div className="sensor-chip">
            <span>Samples</span>
            <strong>{anchorSampleSummary?.sampleCount ?? 0}</strong>
          </div>
        </div>
        {currentLocation && (
          <div className="sensor-note">
            <span>
              {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
            </span>
            <span>{getAccuracyLabel(currentLocation.accuracy)}</span>
          </div>
        )}
        <p className="helper-copy">
          纯网页不能替用户“永久自动授权” GPS，但现在应用会持续请求高精度定位，并明确提示你在浏览器地址栏里把站点设成 Allow。
        </p>
        <div className="status-banner soft">
          <Compass size={16} />
          <div>
            <strong>{platform === 'ios' ? 'iPhone guidance' : platform === 'android' ? 'Android guidance' : 'Desktop guidance'}</strong>
            <p>{permissionGuide}</p>
          </div>
        </div>
        <div className="panel-actions">
          <button className="ghost-pill" onClick={requestLocationRefresh}>
            <LocateFixed size={16} />
            Refresh GPS
          </button>
          {orientationStatus === 'needs-permission' && (
            <button className="ghost-pill" onClick={requestOrientationAccess}>
              <Compass size={16} />
              Enable compass
            </button>
          )}
        </div>
        {(geoError || orientationError) && (
          <div className="status-banner warning">
            <ShieldAlert size={16} />
            <div>
              <strong>Permission guidance</strong>
              <p>{geoError || orientationError}</p>
            </div>
          </div>
        )}
      </SectionCard>

      {pageMode === 'setup' ? (
        <>
          <SectionCard eyebrow="Field Checklist" title="Before you walk">
            <div className="checklist">
              {checklistItems.map((item) => (
                <div key={item.label} className={`checklist-item ${item.done ? 'done' : ''}`}>
                  <span className="check-indicator">{item.done ? <CheckCircle2 size={16} /> : <Crosshair size={16} />}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard eyebrow="Setup Flow" title={`Current anchor: ${selectedAnchor?.name || selectedAnchor?.short || 'None'}`}>
            <div className={`wizard-callout tone-${selectedAnchorProgress.mapTone}`}>
              <span className="wizard-step-number">{selectedAnchorProgress.step}</span>
              <div>
                <strong>{selectedAnchorProgress.title}</strong>
                <p>{selectedAnchorProgress.detail}</p>
              </div>
            </div>
            <div className="panel-actions">
              <button className="primary-pill" onClick={addAnchor}>
                <Plus size={16} />
                Add anchor
              </button>
              <button className="ghost-pill" onClick={() => setSetupComplete(true)} disabled={readyAnchors.length < 2}>
                <CheckCircle2 size={16} />
                Skip to map
              </button>
            </div>
          </SectionCard>

          <SectionCard eyebrow="Anchor Editor" title="Bind one point carefully">
            {selectedAnchor ? (
              <>
                <label className="field-block">
                  <span>1. Anchor name</span>
                  <input
                    value={selectedAnchor.name}
                    onChange={(event) => updateAnchorName(selectedAnchor.id, event.target.value)}
                    placeholder="e.g. Library entrance / North gate"
                  />
                </label>

                <div className="anchor-step-grid">
                  <div className={`anchor-step-card ${selectedAnchor.x != null ? 'done' : 'active'}`}>
                    <MapPinned size={16} />
                    <span>Map point</span>
                    <strong>
                      {selectedAnchor.x == null
                        ? 'Not placed'
                        : `${selectedAnchor.x.toFixed(1)} / ${selectedAnchor.y.toFixed(1)}`}
                    </strong>
                  </div>
                  <div className={`anchor-step-card ${selectedAnchor.lat != null ? 'done' : selectedAnchor.x != null ? 'active' : ''}`}>
                    <Radar size={16} />
                    <span>GPS bind</span>
                    <strong>
                      {selectedAnchor.lat == null
                        ? `${anchorSampleSummary?.sampleCount ?? 0} samples ready`
                        : `${selectedAnchor.gpsAccuracy?.toFixed(1) ?? '--'} m`}
                    </strong>
                  </div>
                  <div className={`anchor-step-card ${selectedAnchorReady ? 'done' : ''}`}>
                    <CheckCircle2 size={16} />
                    <span>Confirm</span>
                    <strong>{selectedAnchorReady ? 'Ready' : 'Locked'}</strong>
                  </div>
                </div>

                <div className="status-banner soft">
                  <Radar size={16} />
                  <div>
                    <strong>现场建议</strong>
                    <p>
                      站在锚点附近静止 5 到 10 秒再绑定，优先选路口、入口、楼角这类容易复现的位置。
                    </p>
                  </div>
                </div>

                <div className="panel-actions compact-actions">
                  <button className="ghost-pill" onClick={bindSelectedAnchorGps} disabled={!anchorSampleSummary && !currentLocation}>
                    <Radar size={16} />
                    Bind averaged GPS
                  </button>
                  <button className="ghost-pill" onClick={resetAnchor}>
                    <RefreshCcw size={16} />
                    Reset
                  </button>
                  <button className="ghost-pill warning" onClick={deleteSelectedAnchor}>
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>

                <div className="panel-actions">
                  <button className="primary-pill" onClick={confirmCurrentAnchor} disabled={!selectedAnchorReady}>
                    <CheckCircle2 size={16} />
                    Confirm anchor
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-inline">Create an anchor first.</div>
            )}
          </SectionCard>

          <SectionCard eyebrow="Anchor Queue" title="Calibration points">
            <div className="anchor-list">
              {anchors.length === 0 && <div className="empty-inline">No anchors yet.</div>}
              {anchors.map((anchor) => (
                <button
                  key={anchor.id}
                  className={`anchor-list-item ${selectedAnchor?.id === anchor.id ? 'active' : ''}`}
                  onClick={() => setSelectedAnchorId(anchor.id)}
                >
                  <span className="anchor-badge">{anchor.short}</span>
                  <span className="anchor-copy">
                    <strong>{anchor.name || 'Unnamed anchor'}</strong>
                    <small>
                      {isAnchorReady(anchor)
                        ? `${getAnchorQuality(anchor).label} · GPS ${anchor.gpsAccuracy?.toFixed(1) ?? '--'}m`
                        : anchor.x == null
                          ? 'Step 1: place on map'
                          : 'Step 2: bind GPS'}
                    </small>
                  </span>
                  <span className={`anchor-state ${isAnchorReady(anchor) ? 'ready' : ''} tone-${getAnchorQuality(anchor).tone}`}>
                    {isAnchorReady(anchor) ? getAnchorQuality(anchor).label : 'Pending'}
                  </span>
                </button>
              ))}
            </div>
            <div className="status-banner soft">
              <Layers3 size={16} />
              <div>
                <strong>Anchor spread</strong>
                <p>{anchorSpreadHint}</p>
              </div>
            </div>
          </SectionCard>
        </>
      ) : (
        <>
          <SectionCard eyebrow="Live Map" title="Realtime guidance">
            <div className="stats-grid">
              <TopStat label="Tasks" value={tasks.length} tone="blue" />
              <TopStat label="Stacks" value={taskGroups.filter((group) => group.tasks.length > 1).length} tone="green" />
              <TopStat label="Expired" value={tasks.filter((task) => isTaskExpired(task)).length} tone="pink" />
              <TopStat label="Completed" value={tasks.filter((task) => task.status === 'completed').length} tone="gold" />
            </div>
            <div className="sensor-note">
              <span>
                Blue dot: {liveMapPoint ? (pageMode === 'setup' ? 'Preview visible' : 'Visible') : 'Need 2 ready anchors'}
              </span>
              <span>Heading: {mapHeading == null ? '--' : `${Math.round(mapHeading)}°`}</span>
            </div>
            <div className="panel-actions">
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
          </SectionCard>

          <SectionCard eyebrow="Filters" title="Task feed">
            <div className="search-field">
              <Search size={16} />
              <input
                value={taskQuery}
                onChange={(event) => setTaskQuery(event.target.value)}
                placeholder="Search tasks"
              />
            </div>
            <div className="field-grid">
              <label className="field-block">
                <span>Type</span>
                <select value={taskTypeFilter} onChange={(event) => setTaskTypeFilter(event.target.value)}>
                  <option value="all">All types</option>
                  {TASK_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>Status</span>
                <select value={taskStatusFilter} onChange={(event) => setTaskStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="expired">Expired</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
            </div>
          </SectionCard>

          <SectionCard eyebrow="Nearby Points" title="Task list">
            <div className="task-list">
              {filteredTasks.length === 0 && <div className="empty-inline">No tasks match the current filters.</div>}
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
                      setSheetExpanded(true);
                    }}
                  >
                    <span className={`task-tone-dot tone-${getTaskTypeMeta(task.type).tone}`} />
                    <span className="task-list-copy">
                      <strong>{task.title}</strong>
                      <small>
                        {getTaskTypeMeta(task.type).label} · {task.directionLabel} · {task.distanceLabel}
                      </small>
                    </span>
                    <span className={`task-status-chip ${task.status} ${expired ? 'expired' : ''}`}>
                      {stack && stack.tasks.length > 1
                        ? `${stack.tasks.length} stacked`
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
          </SectionCard>

          {selectedTask && (
            <SectionCard eyebrow="Selected Point" title={selectedTask.title}>
              <p className="helper-copy">{selectedTask.description || 'No extra description yet.'}</p>
              <div className="mini-grid">
                <div className="mini-info">
                  <span>Type</span>
                  <strong>{getTaskTypeMeta(selectedTask.type).label}</strong>
                </div>
                <div className="mini-info">
                  <span>Start</span>
                  <strong>{formatDateTime(selectedTask.startTime)}</strong>
                </div>
                <div className="mini-info">
                  <span>End</span>
                  <strong>{formatDateTime(selectedTask.endTime)}</strong>
                </div>
                <div className="mini-info">
                  <span>Status</span>
                  <strong>{selectedTask.status === 'completed' ? 'Completed' : isTaskExpired(selectedTask) ? 'Expired' : 'Pending'}</strong>
                </div>
              </div>
              {role === 'uploader' && (
                <div className="panel-actions compact-actions">
                  <button className="ghost-pill" onClick={() => openTaskEditDialog(selectedTask)}>
                    <PencilLine size={16} />
                    Edit
                  </button>
                  <button className="ghost-pill" onClick={toggleTaskComplete}>
                    <CheckCircle2 size={16} />
                    Toggle done
                  </button>
                  <button className="ghost-pill warning" onClick={deleteTask}>
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              )}
            </SectionCard>
          )}
        </>
      )}
    </aside>
  );

  const mobileSheet = (
    <div className={`mobile-sheet ${sheetExpanded ? 'expanded' : ''}`}>
      <button className="sheet-handle" onClick={() => setSheetExpanded((value) => !value)}>
        <span />
      </button>
      <div className="sheet-tabs">
        <button className={sheetSection === 'anchors' ? 'active' : ''} onClick={() => setSheetSection('anchors')}>
          Anchors
        </button>
        <button className={sheetSection === 'tasks' ? 'active' : ''} onClick={() => setSheetSection('tasks')}>
          Tasks
        </button>
        <button className={sheetSection === 'insight' ? 'active' : ''} onClick={() => setSheetSection('insight')}>
          Insight
        </button>
      </div>

      <div className="mobile-sheet-body">
        {sheetSection === 'anchors' && (
          <>
            <SectionCard eyebrow="Checklist" title="Field-ready status">
              <div className="checklist compact-checklist">
                {checklistItems.map((item) => (
                  <div key={item.label} className={`checklist-item ${item.done ? 'done' : ''}`}>
                    <span className="check-indicator">{item.done ? <CheckCircle2 size={15} /> : <Crosshair size={15} />}</span>
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard eyebrow="Current Anchor" title={selectedAnchor?.name || selectedAnchor?.short || 'No anchor'}>
              <div className="panel-actions compact-actions">
                <button className="primary-pill" onClick={addAnchor}>
                  <Plus size={16} />
                  Add
                </button>
                <button className="ghost-pill" onClick={bindSelectedAnchorGps} disabled={!anchorSampleSummary && !currentLocation}>
                  <Radar size={16} />
                  Bind GPS
                </button>
              </div>
              {selectedAnchor && (
                <>
                  <label className="field-block">
                    <span>Name</span>
                    <input
                      value={selectedAnchor.name}
                      onChange={(event) => updateAnchorName(selectedAnchor.id, event.target.value)}
                      placeholder="e.g. Dorm lobby"
                    />
                  </label>
                  <div className="mini-grid">
                    <div className="mini-info">
                      <span>Map point</span>
                      <strong>{selectedAnchor.x == null ? 'Tap map' : 'Placed'}</strong>
                    </div>
                    <div className="mini-info">
                      <span>GPS</span>
                      <strong>{selectedAnchor.gpsAccuracy ? `${selectedAnchor.gpsAccuracy.toFixed(1)}m` : 'Waiting'}</strong>
                    </div>
                  </div>
                  <div className="panel-actions compact-actions">
                    <button className="ghost-pill" onClick={confirmCurrentAnchor} disabled={!selectedAnchorReady}>
                      <CheckCircle2 size={16} />
                      Confirm
                    </button>
                    <button className="ghost-pill warning" onClick={resetAnchor}>
                      <RefreshCcw size={16} />
                      Reset
                    </button>
                  </div>
                </>
              )}
            </SectionCard>

            <SectionCard eyebrow="Anchor Queue" title={`${readyAnchors.length}/${anchors.length} ready`}>
              <div className="anchor-list">
                {anchors.length === 0 && <div className="empty-inline">No anchors yet.</div>}
                {anchors.map((anchor) => (
                  <button
                    key={anchor.id}
                    className={`anchor-list-item ${selectedAnchor?.id === anchor.id ? 'active' : ''}`}
                    onClick={() => setSelectedAnchorId(anchor.id)}
                  >
                    <span className="anchor-badge">{anchor.short}</span>
                    <span className="anchor-copy">
                      <strong>{anchor.name || 'Unnamed anchor'}</strong>
                      <small>{isAnchorReady(anchor) ? getAnchorQuality(anchor).label : 'In progress'}</small>
                    </span>
                  </button>
                ))}
              </div>
            </SectionCard>
          </>
        )}

        {sheetSection === 'tasks' && (
          <>
            <SectionCard eyebrow="Actions" title="Map controls">
              <div className="panel-actions compact-actions">
                <button className="ghost-pill" onClick={reopenAnchorSetup}>
                  <MapPinned size={16} />
                  Anchors
                </button>
                <button className="ghost-pill" onClick={requestLocationRefresh}>
                  <LocateFixed size={16} />
                  GPS
                </button>
                {role === 'uploader' && (
                  <button className={`primary-pill ${placingTask ? 'placing-active' : ''}`} onClick={() => setPlacingTask((value) => !value)}>
                    {placingTask ? <X size={16} /> : <Plus size={16} />}
                    {placingTask ? 'Cancel' : 'Task'}
                  </button>
                )}
              </div>
              <div className="search-field compact">
                <Search size={16} />
                <input value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} placeholder="Search tasks" />
              </div>
            </SectionCard>

            <SectionCard eyebrow="Task Feed" title={`${filteredTasks.length} visible`}>
              <div className="task-list">
                {filteredTasks.length === 0 && <div className="empty-inline">No tasks yet.</div>}
                {filteredTasks.map((task) => (
                  <button
                    key={task.id}
                    className={`task-list-item ${selectedTaskId === task.id ? 'active' : ''}`}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <span className={`task-tone-dot tone-${getTaskTypeMeta(task.type).tone}`} />
                    <span className="task-list-copy">
                      <strong>{task.title}</strong>
                      <small>{task.distanceLabel}</small>
                    </span>
                  </button>
                ))}
              </div>
            </SectionCard>

            {selectedTask && (
              <SectionCard eyebrow="Selected Task" title={selectedTask.title}>
                <p className="helper-copy">{selectedTask.description || 'No description yet.'}</p>
                {role === 'uploader' && (
                  <div className="panel-actions compact-actions">
                    <button className="ghost-pill" onClick={() => openTaskEditDialog(selectedTask)}>
                      <PencilLine size={16} />
                      Edit
                    </button>
                    <button className="ghost-pill" onClick={toggleTaskComplete}>
                      <CheckCircle2 size={16} />
                      Toggle
                    </button>
                  </div>
                )}
              </SectionCard>
            )}
          </>
        )}

        {sheetSection === 'insight' && (
          <>
            <SectionCard eyebrow="Live Accuracy" title={getAccuracyLabel(currentLocation?.accuracy)}>
              <div className="stats-grid">
                <TopStat label="Ready anchors" value={readyAnchors.length} tone="blue" />
                <TopStat label="Residual" value={calibration ? `${calibration.meanResidual.toFixed(2)}%` : '--'} tone="gold" />
                <TopStat label="GPS" value={currentLocation ? `${currentLocation.accuracy.toFixed(1)}m` : '--'} tone="green" />
                <TopStat label="Samples" value={anchorSampleSummary?.sampleCount ?? 0} tone="pink" />
              </div>
              <p className="helper-copy">{getCalibrationHint(calibration, readyAnchors.length)}</p>
            </SectionCard>

            <SectionCard eyebrow="Permission" title="Browser note">
              <div className="status-banner">
                <ShieldCheck size={16} />
                <div>
                  <strong>Site permission is browser-controlled</strong>
                  <p>如果要“始终允许”，请在地址栏位置图标中把当前域名设为 Allow。网页代码本身不能替你跳过这一步。</p>
                </div>
              </div>
              <div className="status-banner soft">
                <Compass size={16} />
                <div>
                  <strong>{platform === 'ios' ? 'iPhone guidance' : platform === 'android' ? 'Android guidance' : 'Desktop guidance'}</strong>
                  <p>{permissionGuide}</p>
                </div>
              </div>
              <div className="status-banner soft">
                <Layers3 size={16} />
                <div>
                  <strong>Anchor spread</strong>
                  <p>{anchorSpreadHint}</p>
                </div>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className={`app-shell variant-${APP_VARIANT} ${compactLayout ? 'compact-layout' : ''}`}>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageUpload} />
      <input ref={importInputRef} type="file" accept="application/json" hidden onChange={handleImportWorkspace} />

      <div className="background-blur blur-one" />
      <div className="background-blur blur-two" />
      <div className="background-grid" />

      {pageMode === 'welcome' ? (
        <div className="welcome-shell">
          <div className="welcome-card">
            <span className="eyebrow">Smart Spatial Mapper</span>
            <h1>把校园图片底图和真实世界位置稳稳对齐</h1>
            <p>
              这个版本专门针对你现在的使用场景重做了核心逻辑: 支持多锚点拟合、蓝点走出三角区、实时精度提示，以及适合桌面与手机的双界面。
            </p>

            <div className="welcome-feature-grid">
              <div className="feature-card">
                <Layers3 size={18} />
                <strong>Affine fitting</strong>
                <span>3 点以上不再用加权平均，而是拟合完整的地理平面到图片平面映射。</span>
              </div>
              <div className="feature-card">
                <Radar size={18} />
                <strong>GPS averaging</strong>
                <span>绑定锚点时会自动使用多次高精度采样平均，减少单次抖动。</span>
              </div>
              <div className="feature-card">
                <Smartphone size={18} />
                <strong>Desktop + mobile</strong>
                <span>同一套核心逻辑，同时输出桌面控制台和手机底部抽屉体验。</span>
              </div>
            </div>

            <div className="checklist welcome-checklist">
              <div className="checklist-item">
                <span className="check-indicator"><Upload size={16} /></span>
                <div>
                  <strong>1. 上传校园底图</strong>
                  <small>建议使用俯视图、总平面图或明确标记了道路与楼宇的图片。</small>
                </div>
              </div>
              <div className="checklist-item">
                <span className="check-indicator"><MapPinned size={16} /></span>
                <div>
                  <strong>2. 实地绑定 4 到 6 个锚点</strong>
                  <small>优先选边界、拐角、入口，不要把所有点挤在一个角落。</small>
                </div>
              </div>
              <div className="checklist-item">
                <span className="check-indicator"><Radar size={16} /></span>
                <div>
                  <strong>3. 每个点停留几秒后再绑定</strong>
                  <small>这样平均采样才能真正压掉 GPS 抖动。</small>
                </div>
              </div>
              <div className="checklist-item">
                <span className="check-indicator"><Navigation size={16} /></span>
                <div>
                  <strong>4. 边走边看蓝点和残差</strong>
                  <small>如果边缘漂移明显，优先补边界锚点，而不是只重复绑中心点。</small>
                </div>
              </div>
            </div>

            <div className="welcome-actions">
              <button className="primary-pill" onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} />
                Upload map image
              </button>
              <button className="ghost-pill" onClick={() => importInputRef.current?.click()}>
                <Import size={16} />
                Import workspace
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {!compactLayout && (
            <button
              className="hide-toggle"
              onClick={() => setHudHidden((value) => !value)}
              aria-label={hudHidden ? 'Show panel' : 'Hide panel'}
            >
              {hudHidden ? <Eye size={16} /> : <EyeOff size={16} />}
              {hudHidden ? 'Show panel' : 'Hide panel'}
            </button>
          )}

          <div className="experience-layout">
            {!compactLayout && !hudHidden && desktopPanel}

            <main className="map-board">
              <div className="map-topbar">
                <div className="topbar-chip brand">
                  <MapPinned size={15} />
                  <span>{APP_VARIANT === 'mobile' ? 'smp_v2_mobile' : 'smp_v2'}</span>
                </div>
                <div className="topbar-chip">
                  <ShieldCheck size={15} />
                  <span>{getCalibrationLabel(calibration, readyAnchors.length)}</span>
                </div>
                <div className="topbar-chip">
                  <LocateFixed size={15} />
                  <span>{currentLocation ? `${currentLocation.accuracy.toFixed(1)}m` : 'GPS --'}</span>
                </div>
              </div>

              {(pageMode === 'setup' || (pageMode === 'map' && placingTask && role === 'uploader')) && (
                <div className="setup-tip">
                  {pageMode === 'setup' ? (
                    <>
                      <Crosshair size={16} />
                      在底图上点击当前锚点的位置，再走到现实中的那个位置绑定平均 GPS。
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      点击地图投放一个新任务点。
                    </>
                  )}
                </div>
              )}

              <TransformWrapper
                minScale={0.72}
                maxScale={5}
                initialScale={1}
                centerOnInit
                limitToBounds
                panning={{ disabled: placingTask }}
                wheel={{ disabled: placingTask }}
                pinch={{ disabled: placingTask }}
                doubleClick={{ disabled: placingTask }}
                onTransformed={(ref) => setMapScale(ref.state.scale)}
              >
                {(utils) => (
                  <>
                    <TransformComponent wrapperClass="map-wrapper" contentClass="map-content">
                      <div className={`map-stage ${placingTask ? 'placing-mode' : ''}`}>
                        <div className="map-image-frame">
                          <img src={bgImage} alt="Campus map" className="map-image" draggable="false" />
                          <div className="map-overlay-tone" />

                          {pageMode === 'setup' && (
                            <div className={`map-coach-badge tone-${selectedAnchorProgress.mapTone}`}>
                              <span>{selectedAnchorProgress.step}</span>
                              <strong>{selectedAnchorProgress.mapHint}</strong>
                            </div>
                          )}

                          {(pageMode === 'setup' || (pageMode === 'map' && placingTask && role === 'uploader')) && (
                            <button
                              className="map-hit-layer"
                              onClick={pageMode === 'setup' ? markAnchorOnMap : handleTaskPlacement}
                              aria-label={pageMode === 'setup' ? 'Select anchor point' : 'Place task'}
                            >
                              <span className="sr-only">interactive map layer</span>
                            </button>
                          )}

                          {pageMode === 'setup' && anchors.some((anchor) => anchor.x != null && anchor.y != null) && (
                            <svg className="anchor-visual-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                              {anchors
                                .filter((anchor) => anchor.x != null && anchor.y != null)
                                .map((anchor, index, placedAnchors) => {
                                  const nextAnchor = placedAnchors[index + 1];
                                  if (!nextAnchor) return null;
                                  return (
                                    <line
                                      key={`${anchor.id}-${nextAnchor.id}`}
                                      className="anchor-link"
                                      x1={anchor.x}
                                      y1={anchor.y}
                                      x2={nextAnchor.x}
                                      y2={nextAnchor.y}
                                    />
                                  );
                                })}
                            </svg>
                          )}

                          {anchors
                            .filter((anchor) => anchor.x != null && anchor.y != null)
                            .map((anchor) => (
                              <Motion.button
                                key={anchor.id}
                                className={`anchor-marker ${selectedAnchor?.id === anchor.id ? 'selected' : ''} ${
                                  isAnchorReady(anchor) ? 'ready-marker' : 'pending-marker'
                                } ${pageMode === 'setup' ? 'setup-anchor-marker' : ''}`}
                                style={{
                                  left: `${anchor.x}%`,
                                  top: `${anchor.y}%`,
                                  '--marker-scale': mapScale,
                                }}
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedAnchorId(anchor.id);
                                  setSheetExpanded(true);
                                }}
                              >
                                {pageMode === 'setup' && <span className="anchor-target-ring" />}
                                <span className="anchor-core">
                                  {anchor.short}
                                </span>
                                <span className="anchor-label">
                                  {selectedAnchor?.id === anchor.id
                                    ? `CURRENT · ${anchor.name || anchor.short}`
                                    : isAnchorReady(anchor)
                                      ? `${anchor.name || anchor.short} · ready`
                                      : `${anchor.name || anchor.short} · needs GPS`}
                                </span>
                              </Motion.button>
                            ))}

                          {pageMode === 'map' &&
                            taskGroups.map((group) => {
                              const primaryTask = group.tasks[0];
                              return (
                                <Motion.button
                                  key={group.key}
                                  className={`task-marker ${selectedStackKey === group.key ? 'selected' : ''}`}
                                  style={{
                                    left: `${group.x}%`,
                                    top: `${group.y}%`,
                                    '--marker-scale': mapScale,
                                  }}
                                  initial={{ opacity: 0, scale: 0.85 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedStackKey(group.key);
                                    setSelectedTaskId(group.tasks[0].id);
                                    setSheetSection('tasks');
                                    setSheetExpanded(true);
                                  }}
                                >
                                  <span className={`task-marker-core tone-${getTaskTypeMeta(primaryTask.type).tone}`}>
                                    {group.tasks.length > 1 ? group.tasks.length : <Navigation size={14} strokeWidth={2.4} />}
                                  </span>
                                  <span className="task-marker-label">
                                    {group.tasks.length > 1 ? `${group.tasks.length} tasks` : primaryTask.title}
                                  </span>
                                </Motion.button>
                              );
                            })}

                          {liveMapPoint && (
                            <div
                              className={`user-location ${pageMode === 'setup' ? 'setup-preview' : ''}`}
                              style={{ left: `${liveMapPoint.x}%`, top: `${liveMapPoint.y}%` }}
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
                        </div>
                      </div>
                    </TransformComponent>

                    <div className="floating-controls">
                      <button className="icon-glass-btn" onClick={() => utils.zoomIn(0.3)} aria-label="Zoom in">
                        <ZoomIn size={18} />
                      </button>
                      <button className="icon-glass-btn" onClick={() => utils.zoomOut(0.3)} aria-label="Zoom out">
                        <ZoomOut size={18} />
                      </button>
                    </div>
                  </>
                )}
              </TransformWrapper>

              {compactLayout && (
                <div className="mobile-top-actions">
                  <button className="mini-ghost" onClick={() => setRole((current) => (current === 'uploader' ? 'viewer' : 'uploader'))}>
                    <Settings2 size={16} />
                    {role === 'uploader' ? 'Admin' : 'Viewer'}
                  </button>
                  <button className="mini-ghost" onClick={() => importInputRef.current?.click()}>
                    <Import size={16} />
                    Import
                  </button>
                  <button className="mini-ghost" onClick={exportWorkspace}>
                    <Upload size={16} />
                    Export
                  </button>
                </div>
              )}

              {compactLayout && mobileSheet}
            </main>
          </div>

          {taskDraftPoint && (
            <TaskModal
              mode={taskDialogMode}
              form={taskForm}
              setForm={setTaskForm}
              onClose={resetTaskForm}
              onSubmit={submitTask}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
