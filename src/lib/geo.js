const EARTH_RADIUS_METERS = 6371000;

export function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

export function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function toDegrees(value) {
  return (value * 180) / Math.PI;
}

export function getDistanceMeters(from, to) {
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

export function getScreenBearing(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return normalizeDegrees(toDegrees(Math.atan2(dx, -dy)));
}

export function getMapDistance(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function meanGeoPoint(points) {
  if (points.length === 0) return null;
  const total = points.reduce(
    (sum, point) => ({
      lat: sum.lat + point.lat,
      lng: sum.lng + point.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: total.lat / points.length,
    lng: total.lng / points.length,
  };
}

export function projectToLocalMeters(point, origin) {
  const averageLat = toRadians((point.lat + origin.lat) / 2);
  const east = toRadians(point.lng - origin.lng) * EARTH_RADIUS_METERS * Math.cos(averageLat);
  const north = toRadians(point.lat - origin.lat) * EARTH_RADIUS_METERS;
  return { east, north };
}

function solve3x3(matrix, vector) {
  const rows = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) {
        pivot = row;
      }
    }

    if (Math.abs(rows[pivot][column]) < 1e-9) return null;
    if (pivot !== column) {
      [rows[pivot], rows[column]] = [rows[column], rows[pivot]];
    }

    const pivotValue = rows[column][column];
    for (let cell = column; cell < 4; cell += 1) {
      rows[column][cell] /= pivotValue;
    }

    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let cell = column; cell < 4; cell += 1) {
        rows[row][cell] -= factor * rows[column][cell];
      }
    }
  }

  return rows.map((row) => row[3]);
}

function buildCalibrationMetrics(anchors, projectPoint) {
  const residuals = anchors.map((anchor) => {
    const projected = projectPoint(anchor);
    return Math.hypot(projected.x - anchor.x, projected.y - anchor.y);
  });

  const meanResidual =
    residuals.reduce((sum, residual) => sum + residual, 0) / Math.max(residuals.length, 1);

  return {
    residuals,
    meanResidual,
    maxResidual: residuals.reduce((max, residual) => Math.max(max, residual), 0),
  };
}

function createPairwiseScaleEstimate(anchors) {
  const ratios = [];
  for (let index = 0; index < anchors.length; index += 1) {
    for (let pairIndex = index + 1; pairIndex < anchors.length; pairIndex += 1) {
      const start = anchors[index];
      const end = anchors[pairIndex];
      const geoDistance = getDistanceMeters(start, end);
      const screenDistance = Math.hypot(end.x - start.x, end.y - start.y);
      if (geoDistance < 2 || screenDistance < 0.01) continue;
      ratios.push(geoDistance / screenDistance);
    }
  }

  if (ratios.length === 0) return null;
  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
}

function createTranslationCalibration(anchor) {
  return {
    model: 'single-anchor',
    origin: { lat: anchor.lat, lng: anchor.lng },
    meanResidual: 0,
    maxResidual: 0,
    metersPerPercent: null,
    project: () => ({ x: anchor.x, y: anchor.y }),
    projectMeters: () => ({ x: anchor.x, y: anchor.y }),
  };
}

function createSimilarityCalibration(anchors) {
  const [first, second] = anchors;
  const origin = { lat: first.lat, lng: first.lng };
  const geoVector = projectToLocalMeters(second, origin);
  const geoDistance = Math.hypot(geoVector.east, geoVector.north);
  const screenVector = {
    x: second.x - first.x,
    y: second.y - first.y,
  };
  const screenDistance = Math.hypot(screenVector.x, screenVector.y);

  if (geoDistance < 1e-6 || screenDistance < 1e-6) return createTranslationCalibration(first);

  const scale = screenDistance / geoDistance;
  const theta =
    Math.atan2(screenVector.y, screenVector.x) - Math.atan2(geoVector.north, geoVector.east);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);

  const projectMeters = ({ east, north }) => ({
    x: first.x + scale * (cosTheta * east - sinTheta * north),
    y: first.y + scale * (sinTheta * east + cosTheta * north),
  });

  const project = (point) => projectMeters(projectToLocalMeters(point, origin));
  const metrics = buildCalibrationMetrics(anchors, project);

  return {
    model: 'similarity',
    origin,
    meanResidual: metrics.meanResidual,
    maxResidual: metrics.maxResidual,
    metersPerPercent: createPairwiseScaleEstimate(anchors),
    project,
    projectMeters,
  };
}

function createAffineCalibration(anchors) {
  const origin = meanGeoPoint(anchors);
  const rows = anchors.map((anchor) => projectToLocalMeters(anchor, origin));

  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atx = [0, 0, 0];
  const aty = [0, 0, 0];

  rows.forEach((row, index) => {
    const vector = [row.east, row.north, 1];
    for (let left = 0; left < 3; left += 1) {
      for (let right = 0; right < 3; right += 1) {
        ata[left][right] += vector[left] * vector[right];
      }
      atx[left] += vector[left] * anchors[index].x;
      aty[left] += vector[left] * anchors[index].y;
    }
  });

  const solveX = solve3x3(ata, atx);
  const solveY = solve3x3(ata, aty);
  if (!solveX || !solveY) {
    return createSimilarityCalibration(anchors.slice(0, 2));
  }

  const projectMeters = ({ east, north }) => ({
    x: solveX[0] * east + solveX[1] * north + solveX[2],
    y: solveY[0] * east + solveY[1] * north + solveY[2],
  });
  const project = (point) => projectMeters(projectToLocalMeters(point, origin));
  const metrics = buildCalibrationMetrics(anchors, project);

  return {
    model: 'affine',
    origin,
    meanResidual: metrics.meanResidual,
    maxResidual: metrics.maxResidual,
    metersPerPercent: createPairwiseScaleEstimate(anchors),
    project,
    projectMeters,
  };
}

export function createCalibration(anchors) {
  if (anchors.length === 0) return null;
  if (anchors.length === 1) return createTranslationCalibration(anchors[0]);
  if (anchors.length === 2) return createSimilarityCalibration(anchors);
  return createAffineCalibration(anchors);
}

export function estimateWeightedPosition(currentLocation, anchors) {
  if (!currentLocation || anchors.length === 0) return null;
  if (anchors.length === 1) return { x: anchors[0].x, y: anchors[0].y };

  let weightSum = 0;
  let xSum = 0;
  let ySum = 0;

  for (const anchor of anchors) {
    const distance = getDistanceMeters(currentLocation, anchor);
    if (distance < 2) return { x: anchor.x, y: anchor.y };
    const weight = 1 / Math.max(distance, 2) ** 2;
    weightSum += weight;
    xSum += anchor.x * weight;
    ySum += anchor.y * weight;
  }

  if (!weightSum) return null;
  return { x: xSum / weightSum, y: ySum / weightSum };
}

export function projectLocationToMap(currentLocation, anchors, calibration) {
  if (!currentLocation || anchors.length === 0) return null;
  if (calibration) return calibration.project(currentLocation);
  return estimateWeightedPosition(currentLocation, anchors);
}

export function getScreenNorthBearing(calibration) {
  if (!calibration) return null;
  const from = calibration.projectMeters({ east: 0, north: 0 });
  const to = calibration.projectMeters({ east: 0, north: 10 });
  return getScreenBearing(from, to);
}
