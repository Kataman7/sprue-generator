import * as THREE from 'three';

/**
 * Calculates array layout, bounds, runners, and coordinates
 */
export function computeSprueBounds(state) {
  const rows = state.rows;
  const cols = state.cols;
  const totalCount = rows * cols;
  const spanX = (cols - 1) * state.spacing;
  const halfSizeX = state.dimensions.x / 2;
  const halfSizeY = state.dimensions.y / 2;

  // Minimum safety clearance between parts and frame/rails
  const clearance = Math.max(state.frameWidth / 2 + 1.2, 2.2);
  const halfFrameD = state.frameWidth / 2;

  // Y spacing between row centers (guarantees single shared intermediate runner)
  const rowSpacingY = state.dimensions.y + 2 * clearance + state.frameWidth;

  // Row positions centered at Y=0
  const rowPositions = [];
  for (let r = 0; r < rows; r++) {
    const posY = (r - (rows - 1) / 2) * rowSpacingY;
    const yRailBelow = posY - halfSizeY - clearance - halfFrameD;
    const yRailAbove = posY + halfSizeY + clearance + halfFrameD;
    rowPositions.push({
      rIdx: r,
      y: posY,
      rotZ: 0,
      yRailBelow,
      yRailAbove
    });
  }

  // Unique horizontal Y runners
  const railYSet = new Set();
  rowPositions.forEach((rp) => {
    railYSet.add(Math.round(rp.yRailBelow * 1000) / 1000);
    railYSet.add(Math.round(rp.yRailAbove * 1000) / 1000);
  });
  const allRailYs = Array.from(railYSet).sort((a, b) => a - b);
  const yMin = allRailYs[0];
  const yMax = allRailYs[allRailYs.length - 1];
  const intermediateRails = allRailYs.filter(y => y > yMin + 0.05 && y < yMax - 0.05);

  // X limits of the perimeter frame
  const xMin = - (spanX / 2 + halfSizeX + clearance + halfFrameD);
  const xMax = (spanX / 2 + halfSizeX + clearance + halfFrameD);

  // Z attachment level
  let zAttach = 0;
  if (state.structureZMode === 'flat_bottom') {
    zAttach = -state.dimensions.z / 2 + halfFrameD;
  } else {
    zAttach = (state.gate1Picked && state.gate2Picked)
      ? (state.gate1Point.z + state.gate2Point.z) / 2
      : 0;
  }

  return {
    rows,
    cols,
    totalCount,
    spanX,
    rowPositions,
    intermediateRails,
    xMin,
    xMax,
    yMin,
    yMax,
    zAttach,
    clearance
  };
}

/**
 * Finds the closest support point on the runner frame for a given contact point
 */
export function getClosestSupportOnSprue(pTouch, rIdx, cIdx, bounds) {
  const rp = bounds.rowPositions[rIdx];
  const zAttach = bounds.zAttach;

  const yBelow = rp.yRailBelow;
  const yAbove = rp.yRailAbove;

  const distBelow = Math.abs(pTouch.y - yBelow);
  const distAbove = Math.abs(yAbove - pTouch.y);

  // Distances to vertical perimeter bars for edge columns
  const isLeftmost = (cIdx === 0);
  const isRightmost = (cIdx === bounds.cols - 1);
  const distLeft = isLeftmost ? Math.abs(pTouch.x - bounds.xMin) : Infinity;
  const distRight = isRightmost ? Math.abs(bounds.xMax - pTouch.x) : Infinity;

  const minDist = Math.min(distBelow, distAbove, distLeft, distRight);

  if (minDist === distBelow) {
    return new THREE.Vector3(
      Math.max(bounds.xMin, Math.min(bounds.xMax, pTouch.x)),
      yBelow,
      zAttach
    );
  } else if (minDist === distAbove) {
    return new THREE.Vector3(
      Math.max(bounds.xMin, Math.min(bounds.xMax, pTouch.x)),
      yAbove,
      zAttach
    );
  } else if (minDist === distLeft) {
    return new THREE.Vector3(
      bounds.xMin,
      Math.max(bounds.yMin, Math.min(bounds.yMax, pTouch.y)),
      zAttach
    );
  } else {
    return new THREE.Vector3(
      bounds.xMax,
      Math.max(bounds.yMin, Math.min(bounds.yMax, pTouch.y)),
      zAttach
    );
  }
}

/**
 * Automatic solid orientation (largest flat surface on bed + minimal Z height)
 */
export function autoOrientBestSolidBase(geometry, state) {
  if (!geometry || !geometry.attributes.position) return;

  geometry.center();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const pos = geometry.attributes.position;
  const count = pos.count;
  if (count < 3) return;

  const tests = [
    { dir: new THREE.Vector3(0, 0, -1), axis: 'z', sign: -1, name: '-Z' },
    { dir: new THREE.Vector3(0, 0, 1),  axis: 'z', sign:  1, name: '+Z' },
    { dir: new THREE.Vector3(0, -1, 0), axis: 'y', sign: -1, name: '-Y' },
    { dir: new THREE.Vector3(0, 1, 0),  axis: 'y', sign:  1, name: '+Y' },
    { dir: new THREE.Vector3(-1, 0, 0), axis: 'x', sign: -1, name: '-X' },
    { dir: new THREE.Vector3(1, 0, 0),  axis: 'x', sign:  1, name: '+X' },
  ];

  const bbox = geometry.boundingBox;
  const dims = new THREE.Vector3();
  bbox.getSize(dims);

  const scores = tests.map(t => {
    let extremeVal;
    if (t.axis === 'x') extremeVal = t.sign > 0 ? bbox.max.x : bbox.min.x;
    else if (t.axis === 'y') extremeVal = t.sign > 0 ? bbox.max.y : bbox.min.y;
    else extremeVal = t.sign > 0 ? bbox.max.z : bbox.min.z;
    return { ...t, extremeVal, flatArea: 0, zHeight: dims[t.axis] };
  });

  const pA = new THREE.Vector3(), pB = new THREE.Vector3(), pC = new THREE.Vector3();
  const cb = new THREE.Vector3(), ab = new THREE.Vector3(), norm = new THREE.Vector3();
  const isIndexed = !!geometry.index;
  const numTris = isIndexed ? geometry.index.count / 3 : pos.count / 3;

  for (let i = 0; i < numTris; i++) {
    const i0 = isIndexed ? geometry.index.getX(i * 3) : i * 3;
    const i1 = isIndexed ? geometry.index.getX(i * 3 + 1) : i * 3 + 1;
    const i2 = isIndexed ? geometry.index.getX(i * 3 + 2) : i * 3 + 2;

    pA.fromBufferAttribute(pos, i0);
    pB.fromBufferAttribute(pos, i1);
    pC.fromBufferAttribute(pos, i2);

    cb.subVectors(pC, pB);
    ab.subVectors(pA, pB);
    cb.cross(ab);
    const triArea = cb.length() * 0.5;
    if (triArea < 1e-4) continue;
    norm.copy(cb).normalize();

    for (const s of scores) {
      if (norm.dot(s.dir) > 0.85) {
        const valA = s.axis === 'x' ? pA.x : (s.axis === 'y' ? pA.y : pA.z);
        if (Math.abs(valA - s.extremeVal) < 0.4) {
          s.flatArea += triArea;
        }
      }
    }
  }

  scores.sort((a, b) => {
    const areaDiff = b.flatArea - a.flatArea;
    if (Math.abs(areaDiff) > 8.0) {
      return areaDiff;
    }
    return a.zHeight - b.zHeight;
  });

  const best = scores[0];

  if (best.name === '+Z') {
    geometry.rotateX(Math.PI);
    state.totalRotation.x = (state.totalRotation.x + 180) % 360;
  } else if (best.name === '-Y') {
    geometry.rotateX(-Math.PI / 2);
    state.totalRotation.x = (state.totalRotation.x - 90 + 360) % 360;
  } else if (best.name === '+Y') {
    geometry.rotateX(Math.PI / 2);
    state.totalRotation.x = (state.totalRotation.x + 90) % 360;
  } else if (best.name === '-X') {
    geometry.rotateY(Math.PI / 2);
    state.totalRotation.y = (state.totalRotation.y + 90) % 360;
  } else if (best.name === '+X') {
    geometry.rotateY(-Math.PI / 2);
    state.totalRotation.y = (state.totalRotation.y - 90 + 360) % 360;
  }

  geometry.center();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const newDims = new THREE.Vector3();
  geometry.boundingBox.getSize(newDims);

  if (newDims.x < newDims.y - 0.1) {
    geometry.rotateZ(Math.PI / 2);
    state.totalRotation.z = (state.totalRotation.z + 90) % 360;
    geometry.center();
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
  }

  state.originalBBox.copy(geometry.boundingBox);
  geometry.boundingBox.getSize(state.dimensions);
}
