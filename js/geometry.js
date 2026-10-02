import * as THREE from 'three';

/**
 * Creates a cylinder mesh/geometry between two 3D points
 */
export function createCylinderGeometryBetween(p1, p2, radius, radialSegments = 20) {
  const v = p2.clone().sub(p1);
  const len = Math.max(v.length(), 0.05);
  const geom = new THREE.CylinderGeometry(radius, radius, len, radialSegments);
  geom.translate(0, len / 2, 0);

  const q = new THREE.Quaternion();
  const dir = v.clone().normalize();
  if (dir.lengthSq() > 0.0001) {
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }
  geom.applyQuaternion(q);
  geom.translate(p1.x, p1.y, p1.z);
  return geom;
}

export function createPoutreMesh(p1, p2, radius, mat, radialSegments = 20) {
  const geom = createCylinderGeometryBetween(p1, p2, radius, radialSegments);
  return new THREE.Mesh(geom, mat);
}

/**
 * Creates a two-section breakaway attachment tab:
 * 1. Thick stem body (from runner support towards part)
 * 2. Thin breakaway neck (strictly stops exactly at pTouch on part surface, 0 penetration)
 */
export function createSubdividedAttache(pSupport, pTouch, targetGroup, customMat, state, defaultFrameMat) {
  const v = pTouch.clone().sub(pSupport);
  const dist = v.length();
  if (dist <= 0.05) return;

  const dir = v.clone().normalize();
  const neckLen = Math.min(state.neckLength, Math.max(dist - 0.5, 0.15));

  // 1. Thick stem body (from runner support)
  const pBodyStart = pSupport.clone();
  const pBodyEnd = pSupport.clone().addScaledVector(dir, dist - neckLen);
  targetGroup.add(createPoutreMesh(pBodyStart, pBodyEnd, state.bodyDiameter / 2, customMat || defaultFrameMat));

  // 2. Thin neck: strictly stops at pTouch on part boundary (ZERO inside the part)
  const pNeckStart = pBodyEnd.clone();
  const pNeckEnd = pTouch.clone(); // Zero penetration: attachment touches surface without entering part
  targetGroup.add(createPoutreMesh(pNeckStart, pNeckEnd, state.neckDiameter / 2, customMat || defaultFrameMat));
}

/**
 * Creates geometry buffers for STL exporter merge
 */
export function addSubdividedAttacheGeoms(pSupport, pTouch, targetArray, state) {
  const v = pTouch.clone().sub(pSupport);
  const dist = v.length();
  if (dist <= 0.05) return;

  const dir = v.clone().normalize();
  const neckLen = Math.min(state.neckLength, Math.max(dist - 0.5, 0.15));

  // Thick stem body
  const pBodyStart = pSupport.clone();
  const pBodyEnd = pSupport.clone().addScaledVector(dir, dist - neckLen);
  targetArray.push(createCylinderGeometryBetween(pBodyStart, pBodyEnd, state.bodyDiameter / 2));

  // Thin neck (stops strictly at pTouch on part surface, 0 intrusion)
  const pNeckStart = pBodyEnd.clone();
  const pNeckEnd = pTouch.clone();
  targetArray.push(createCylinderGeometryBetween(pNeckStart, pNeckEnd, state.neckDiameter / 2));
}

/**
 * Triggers browser download of a generated Blob
 */
export function triggerDownload(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
