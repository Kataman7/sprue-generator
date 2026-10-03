import * as THREE from 'three';
import { state } from './state.js';
import { createPoutreMesh, createSubdividedAttache } from './geometry.js';
import { computeSprueBounds, getClosestSupportOnSprue, autoOrientBestSolidBase } from './sprueLayout.js';
import { setupViewCube } from './viewCube.js';
import { exportMergedSTL } from './exporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

// ──────────────────────────────────────────────────────────────
// THREE.JS VIEWPORT & RENDERING SETUP
// ──────────────────────────────────────────────────────────────
const container = document.getElementById('viewportContainer');
const canvas = document.getElementById('webglCanvas');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf8fafc);

const aspect = container.clientWidth / container.clientHeight;
const perspCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 2000);
perspCamera.position.set(40, 70, 90);

const initialOrthoHeight = 120;
const orthoCamera = new THREE.OrthographicCamera(
  -initialOrthoHeight * aspect / 2,
  initialOrthoHeight * aspect / 2,
  initialOrthoHeight / 2,
  -initialOrthoHeight / 2,
  0.1,
  2000
);
orthoCamera.position.set(40, 70, 90);

let camera = orthoCamera;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const activeControls = new OrbitControls(camera, renderer.domElement);
activeControls.enableDamping = true;
activeControls.dampingFactor = 0.05;
activeControls.maxDistance = 1400;
activeControls.minDistance = 2;

const viewCubeManager = setupViewCube(() => camera, activeControls);

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const dir1 = new THREE.DirectionalLight(0xffffff, 1.1);
dir1.position.set(100, 160, 100);
scene.add(dir1);
const dir2 = new THREE.DirectionalLight(0xcfd5e1, 0.5);
dir2.position.set(-100, -50, -100);
scene.add(dir2);

// Ground Grid (Off by default)
const gridHelper = new THREE.GridHelper(300, 60, 0x6366f1, 0xe2e8f0);
gridHelper.position.y = -0.01;
gridHelper.visible = state.showGrid;
scene.add(gridHelper);

// Scene Groups
export const focusGroup = new THREE.Group();
export const focusSpruePreviewGroup = new THREE.Group();
export const sprueGroup = new THREE.Group();
export const markersGroup = new THREE.Group();
export const guidesGroup = new THREE.Group();
export const hoverMarker = new THREE.Group();

scene.add(focusGroup);
scene.add(focusSpruePreviewGroup);
scene.add(sprueGroup);
scene.add(markersGroup);
scene.add(guidesGroup);
scene.add(hoverMarker);

// Hover Cursor
const hoverSphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.7, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0x4f46e5, wireframe: true })
);
hoverMarker.add(hoverSphere);
hoverMarker.visible = false;

// Standard Materials (Clean & Vibrant)
const pieceMaterial = new THREE.MeshStandardMaterial({
  color: 0xe2e8f0,
  roughness: 0.35,
  metalness: 0.05
});

const frameMaterial = new THREE.MeshStandardMaterial({
  color: 0x4f46e5,
  roughness: 0.3,
  metalness: 0.1
});

const tabMaterial = new THREE.MeshStandardMaterial({
  color: 0x6366f1,
  roughness: 0.35,
  metalness: 0.1
});

const ghostFrameMaterial = new THREE.MeshStandardMaterial({
  color: 0x4f46e5,
  roughness: 0.3,
  metalness: 0.1,
  transparent: true,
  opacity: 0.28,
  depthWrite: false
});

const ghostTabMaterial = new THREE.MeshStandardMaterial({
  color: 0x6366f1,
  roughness: 0.35,
  metalness: 0.1,
  transparent: true,
  opacity: 0.38,
  depthWrite: false
});

// Viewport Resize Listener
window.addEventListener('resize', () => {
  const aspect = container.clientWidth / container.clientHeight;
  perspCamera.aspect = aspect;
  perspCamera.updateProjectionMatrix();

  const frustumHeight = (orthoCamera.top - orthoCamera.bottom);
  const width = frustumHeight * aspect;
  orthoCamera.left = -width / 2;
  orthoCamera.right = width / 2;
  orthoCamera.updateProjectionMatrix();

  renderer.setSize(container.clientWidth, container.clientHeight);
});

// ──────────────────────────────────────────────────────────────
// CAMERA PROJECTION MODES (ISOMETRIC / ORTHO VS PERSPECTIVE)
// ──────────────────────────────────────────────────────────────
const btnCamPersp = document.getElementById('btnCamPersp');
const btnCamOrtho = document.getElementById('btnCamOrtho');

export function setCameraMode(mode) {
  if (mode === state.cameraMode && camera && ((mode === 'orthographic' && camera === orthoCamera) || (mode === 'perspective' && camera === perspCamera))) return;
  state.cameraMode = mode;

  const aspect = container.clientWidth / container.clientHeight;
  const target = activeControls ? activeControls.target.clone() : new THREE.Vector3(0, 0, 0);

  if (mode === 'orthographic') {
    const dist = Math.max(perspCamera.position.distanceTo(target), 10);
    const fovRad = THREE.MathUtils.degToRad(perspCamera.fov * 0.5);
    const height = 2 * dist * Math.tan(fovRad);
    const width = height * aspect;

    orthoCamera.left = -width / 2;
    orthoCamera.right = width / 2;
    orthoCamera.top = height / 2;
    orthoCamera.bottom = -height / 2;
    orthoCamera.zoom = 1;
    orthoCamera.position.copy(perspCamera.position);
    orthoCamera.quaternion.copy(perspCamera.quaternion);
    orthoCamera.up.copy(perspCamera.up);
    orthoCamera.updateProjectionMatrix();

    camera = orthoCamera;
    if (activeControls) activeControls.object = orthoCamera;

    if (btnCamOrtho) btnCamOrtho.className = 'px-2.5 py-1 rounded-md bg-indigo-600 text-white font-medium text-xs shadow-sm transition flex items-center gap-1 cursor-pointer';
    if (btnCamPersp) btnCamPersp.className = 'px-2.5 py-1 rounded-md text-slate-500 hover:text-slate-800 font-medium text-xs transition flex items-center gap-1 cursor-pointer';
  } else {
    const orthoHeight = (orthoCamera.top - orthoCamera.bottom) / orthoCamera.zoom;
    const fovRad = THREE.MathUtils.degToRad(perspCamera.fov * 0.5);
    const targetDist = (orthoHeight / 2) / Math.tan(fovRad);

    const dir = orthoCamera.position.clone().sub(target).normalize();
    if (dir.lengthSq() < 0.0001) dir.set(0, 0.7, 0.7).normalize();
    perspCamera.position.copy(target).addScaledVector(dir, Math.max(targetDist, 10));
    perspCamera.quaternion.copy(orthoCamera.quaternion);
    perspCamera.up.copy(orthoCamera.up);
    perspCamera.aspect = aspect;
    perspCamera.updateProjectionMatrix();

    camera = perspCamera;
    if (activeControls) activeControls.object = perspCamera;

    if (btnCamPersp) btnCamPersp.className = 'px-2.5 py-1 rounded-md bg-indigo-600 text-white font-medium text-xs shadow-sm transition flex items-center gap-1 cursor-pointer';
    if (btnCamOrtho) btnCamOrtho.className = 'px-2.5 py-1 rounded-md text-slate-500 hover:text-slate-800 font-medium text-xs transition flex items-center gap-1 cursor-pointer';
  }

  if (activeControls) {
    activeControls.target.copy(target);
    activeControls.update();
  }
  if (viewCubeManager) viewCubeManager.updateViewCubeRotation();
}

btnCamPersp?.addEventListener('click', () => setCameraMode('perspective'));
btnCamOrtho?.addEventListener('click', () => setCameraMode('orthographic'));
setCameraMode('orthographic');

// ──────────────────────────────────────────────────────────────
// GRID & GUIDES TOGGLES
// ──────────────────────────────────────────────────────────────
const btnToggleGrid = document.getElementById('btnToggleGrid');
const labelToggleGrid = document.getElementById('labelToggleGrid');
btnToggleGrid?.addEventListener('click', () => {
  state.showGrid = !state.showGrid;
  gridHelper.visible = state.showGrid;
  if (state.showGrid) {
    btnToggleGrid.className = 'px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 font-medium text-xs transition flex items-center gap-1.5 border border-indigo-200 cursor-pointer';
    if (labelToggleGrid) labelToggleGrid.textContent = 'Grid: On';
  } else {
    btnToggleGrid.className = 'px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-600 font-medium text-xs transition flex items-center gap-1.5 border border-slate-200 cursor-pointer';
    if (labelToggleGrid) labelToggleGrid.textContent = 'Grid: Off';
  }
});

const btnToggleGuides = document.getElementById('btnToggleGuides');
const labelToggleGuides = document.getElementById('labelToggleGuides');
btnToggleGuides?.addEventListener('click', () => {
  state.showGuides = !state.showGuides;
  state.enableSnapping = state.showGuides;
  updateGuides();
  if (state.showGuides) {
    btnToggleGuides.className = 'px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-600 font-medium text-xs transition flex items-center gap-1.5 border border-sky-200 cursor-pointer';
    if (labelToggleGuides) labelToggleGuides.textContent = 'Guides: On';
  } else {
    btnToggleGuides.className = 'px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-600 font-medium text-xs transition flex items-center gap-1.5 border border-slate-200 cursor-pointer';
    if (labelToggleGuides) labelToggleGuides.textContent = 'Guides: Off';
  }
});

// ──────────────────────────────────────────────────────────────
// FILE LOADING & STL HANDLING
// ──────────────────────────────────────────────────────────────
const dropOverlay = document.getElementById('dropOverlay');
const fileInput = document.getElementById('fileInput');
const btnEmptyUpload = document.getElementById('btnEmptyUpload');

btnEmptyUpload?.addEventListener('click', () => {
  fileInput?.click();
});

['dragenter', 'dragover'].forEach(name => {
  window.addEventListener(name, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropOverlay?.classList.remove('hidden');
    dropOverlay?.classList.add('flex');
  });
});

['dragleave', 'drop'].forEach(name => {
  window.addEventListener(name, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === dropOverlay || name === 'drop') {
      dropOverlay?.classList.add('hidden');
      dropOverlay?.classList.remove('flex');
    }
  });
});

window.addEventListener('drop', (e) => {
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0]);
  }
});

fileInput?.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.stl')) {
    alert('Please provide a valid 3D STL file (.stl)');
    return;
  }
  state.rawFileName = file.name;
  const reader = new FileReader();
  reader.onload = (event) => {
    loadSTLBuffer(event.target.result);
  };
  reader.readAsArrayBuffer(file);
}

const stlLoader = new STLLoader();

export function loadSTLBuffer(buffer) {
  clearSceneMeshes();

  const geometry = stlLoader.parse(buffer);
  if (!geometry || !geometry.attributes.position || geometry.attributes.position.count === 0) {
    alert('Error: Invalid or empty STL file.');
    return;
  }

  state.loadedGeometry = geometry;
  state.totalRotation = { x: 0, y: 0, z: 0 };

  // 1. Automatic smart orientation for solid base and minimal Z height
  autoOrientBestSolidBase(geometry, state);

  // Reference copy of the oriented geometry
  state.originalRawGeometry = geometry.clone();
  state.originalBBox.copy(geometry.boundingBox);
  geometry.boundingBox.getSize(state.dimensions);

  // 2. Focus mesh in center
  const focusMesh = new THREE.Mesh(geometry, pieceMaterial);
  focusMesh.name = 'focusPiece';
  focusGroup.add(focusMesh);

  // 3. Visual symmetry guides
  updateGuides();

  // 4. Auto detect 2 opposite gate points
  autoDetectOppositeGates();

  // 5. Compute compact pitch layout
  autoOptimizeLayout();

  // UI updates
  updateStatsUI(geometry);
  document.getElementById('emptyNotice')?.classList.add('hidden');
  document.getElementById('floatingStats')?.classList.remove('hidden');
  const btnExportSTL = document.getElementById('btnExportSTL');
  if (btnExportSTL) btnExportSTL.disabled = false;
  const btnNextStep = document.getElementById('btnNextStep');
  if (btnNextStep) btnNextStep.disabled = false;

  // 6. Switch to Part Focus mode immediately
  setViewMode('focus');
}

function clearSceneMeshes() {
  [focusGroup, focusSpruePreviewGroup, sprueGroup, markersGroup, guidesGroup].forEach(grp => {
    while (grp.children.length > 0) {
      const obj = grp.children[0];
      grp.remove(obj);
      if (obj.geometry && obj.geometry !== state.loadedGeometry) obj.geometry.dispose();
    }
  });

  if (state.loadedGeometry) {
    state.loadedGeometry.dispose();
    state.loadedGeometry = null;
  }
  if (state.originalRawGeometry) {
    state.originalRawGeometry.dispose();
    state.originalRawGeometry = null;
  }
}

// ──────────────────────────────────────────────────────────────
// AUTO-LAYOUT OPTIMIZATION
// ──────────────────────────────────────────────────────────────
export function autoOptimizeLayout() {
  if (!state.loadedGeometry) return;

  const clearanceX = 2.0;
  state.spacing = Math.max(Math.round((state.dimensions.x + clearanceX) * 10) / 10, 8.0);
  const rangeSpacing = document.getElementById('rangeSpacing');
  const valSpacing = document.getElementById('valSpacing');
  if (rangeSpacing && valSpacing) {
    rangeSpacing.value = state.spacing;
    valSpacing.textContent = state.spacing.toFixed(1);
  }

  state.structureZMode = 'flat_bottom';
  rebuildSprue();
}

// ──────────────────────────────────────────────────────────────
// MODEL ROTATION & ORIENTATION
// ──────────────────────────────────────────────────────────────
export function rotateGeometry(axis, angleRad) {
  if (!state.loadedGeometry) return;

  const deg = Math.round(THREE.MathUtils.radToDeg(angleRad));
  if (axis === 'x') {
    state.loadedGeometry.rotateX(angleRad);
    state.totalRotation.x = (state.totalRotation.x + deg + 360) % 360;
  } else if (axis === 'y') {
    state.loadedGeometry.rotateY(angleRad);
    state.totalRotation.y = (state.totalRotation.y + deg + 360) % 360;
  } else if (axis === 'z') {
    state.loadedGeometry.rotateZ(angleRad);
    state.totalRotation.z = (state.totalRotation.z + deg + 360) % 360;
  }

  state.loadedGeometry.computeVertexNormals();
  state.loadedGeometry.computeBoundingBox();
  state.originalBBox.copy(state.loadedGeometry.boundingBox);
  state.loadedGeometry.boundingBox.getSize(state.dimensions);

  updateRotationBadge();

  // Rotate gate points and normals accordingly
  const axisVec = axis === 'x' ? new THREE.Vector3(1, 0, 0) : (axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
  const q = new THREE.Quaternion().setFromAxisAngle(axisVec, angleRad);

  if (state.gate1Picked) {
    state.gate1Point.applyQuaternion(q);
    state.gate1Normal.applyQuaternion(q).normalize();
    const inputG1X = document.getElementById('inputG1X');
    const inputG1Y = document.getElementById('inputG1Y');
    const inputG1Z = document.getElementById('inputG1Z');
    if (inputG1X) inputG1X.value = state.gate1Point.x.toFixed(2);
    if (inputG1Y) inputG1Y.value = state.gate1Point.y.toFixed(2);
    if (inputG1Z) inputG1Z.value = state.gate1Point.z.toFixed(2);
  }
  if (state.gate2Picked) {
    state.gate2Point.applyQuaternion(q);
    state.gate2Normal.applyQuaternion(q).normalize();
    const inputG2X = document.getElementById('inputG2X');
    const inputG2Y = document.getElementById('inputG2Y');
    const inputG2Z = document.getElementById('inputG2Z');
    if (inputG2X) inputG2X.value = state.gate2Point.x.toFixed(2);
    if (inputG2Y) inputG2Y.value = state.gate2Point.y.toFixed(2);
    if (inputG2Z) inputG2Z.value = state.gate2Point.z.toFixed(2);
  }

  updateStatsUI(state.loadedGeometry);
  updateMarkers();
  updateGuides();
  autoOptimizeLayout();
}

function updateRotationBadge() {
  const badge = document.getElementById('badgeCurrentRotation');
  if (badge) {
    badge.textContent = `${state.totalRotation.x}° / ${state.totalRotation.y}° / ${state.totalRotation.z}°`;
  }
}

export function resetModelRotation() {
  if (!state.originalRawGeometry || !state.loadedGeometry) return;

  state.loadedGeometry.copy(state.originalRawGeometry);
  state.loadedGeometry.computeVertexNormals();
  state.loadedGeometry.computeBoundingBox();
  state.originalBBox.copy(state.loadedGeometry.boundingBox);
  state.loadedGeometry.boundingBox.getSize(state.dimensions);

  state.totalRotation = { x: 0, y: 0, z: 0 };
  updateRotationBadge();

  autoDetectOppositeGates();
  autoOptimizeLayout();
  updateStatsUI(state.loadedGeometry);
  updateMarkers();
  updateGuides();
  rebuildSprue();
}

export function optimizeModelOrientation() {
  if (!state.loadedGeometry) return;
  autoOrientBestSolidBase(state.loadedGeometry, state);
  autoDetectOppositeGates();
  autoOptimizeLayout();
  fitCameraToObject(state.loadedGeometry);
}

// ──────────────────────────────────────────────────────────────
// GUIDES & SYMMETRY PLANES
// ──────────────────────────────────────────────────────────────
export function updateGuides() {
  while (guidesGroup.children.length > 0) {
    const obj = guidesGroup.children[0];
    guidesGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
  }

  if (!state.loadedGeometry) return;

  const size = state.dimensions;
  const maxSpan = Math.max(size.x, size.y, size.z) * 1.5;

  // 1. Plane Y=0 (Sky blue translucent)
  const planeYGeom = new THREE.PlaneGeometry(maxSpan, maxSpan);
  const planeYMat = new THREE.MeshBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.10,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const planeY = new THREE.Mesh(planeYGeom, planeYMat);
  planeY.rotation.x = Math.PI / 2;
  guidesGroup.add(planeY);

  const edgesY = new THREE.LineSegments(
    new THREE.EdgesGeometry(planeYGeom),
    new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.40 })
  );
  edgesY.rotation.x = Math.PI / 2;
  guidesGroup.add(edgesY);

  // 2. Plane X=0 (Violet translucent)
  const planeXGeom = new THREE.PlaneGeometry(maxSpan, maxSpan);
  const planeXMat = new THREE.MeshBasicMaterial({
    color: 0x8b5cf6,
    transparent: true,
    opacity: 0.10,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const planeX = new THREE.Mesh(planeXGeom, planeXMat);
  planeX.rotation.y = Math.PI / 2;
  guidesGroup.add(planeX);

  const edgesX = new THREE.LineSegments(
    new THREE.EdgesGeometry(planeXGeom),
    new THREE.LineBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.40 })
  );
  edgesX.rotation.y = Math.PI / 2;
  guidesGroup.add(edgesX);

  // 3. Wireframe BBox (Indigo)
  const bboxGeom = new THREE.BoxGeometry(size.x, size.y, size.z);
  const bboxWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(bboxGeom),
    new THREE.LineBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.40 })
  );
  guidesGroup.add(bboxWire);

  guidesGroup.visible = state.showGuides;
}

export function fitCameraToObject(geom) {
  if (!state.loadedGeometry) return;
  const size = state.dimensions;
  let maxDim = Math.max(size.x, size.y, size.z);
  if (state.viewMode === 'sprue') {
    const bounds = computeSprueBounds(state);
    const sprueW = bounds.xMax - bounds.xMin;
    const sprueH = bounds.yMax - bounds.yMin;
    maxDim = Math.max(sprueW, sprueH, size.z * 1.5);
  }
  const fov = perspCamera.fov * (Math.PI / 180);
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * (state.viewMode === 'focus' ? 1.85 : 1.35);
  cameraZ = Math.max(cameraZ, 25);

  perspCamera.position.set(cameraZ * 0.7, cameraZ * 0.9, cameraZ);
  perspCamera.lookAt(0, 0, 0);

  const aspect = container.clientWidth / container.clientHeight;
  const height = cameraZ * 2 * Math.tan(fov / 2);
  const width = height * aspect;
  orthoCamera.left = -width / 2;
  orthoCamera.right = width / 2;
  orthoCamera.top = height / 2;
  orthoCamera.bottom = -height / 2;
  orthoCamera.zoom = 1;
  orthoCamera.position.copy(perspCamera.position);
  orthoCamera.lookAt(0, 0, 0);
  orthoCamera.updateProjectionMatrix();

  if (activeControls) {
    activeControls.target.set(0, 0, 0);
    activeControls.update();
  }
  if (viewCubeManager) viewCubeManager.updateViewCubeRotation();
}

function updateStatsUI(geom) {
  const statFileName = document.getElementById('statFileName');
  const statTriangleCount = document.getElementById('statTriangleCount');
  const statDimX = document.getElementById('statDimX');
  const statDimY = document.getElementById('statDimY');
  const statDimZ = document.getElementById('statDimZ');

  if (statFileName) statFileName.textContent = state.rawFileName;
  const triCount = (geom.attributes.position.count / 3).toLocaleString();
  if (statTriangleCount) statTriangleCount.textContent = `${triCount} tri`;
  if (statDimX) statDimX.textContent = state.dimensions.x.toFixed(1);
  if (statDimY) statDimY.textContent = state.dimensions.y.toFixed(1);
  if (statDimZ) statDimZ.textContent = state.dimensions.z.toFixed(1);
}

// ──────────────────────────────────────────────────────────────
// RAYCASTING & GATE PICKING
// ──────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let pointerDownCoord = { x: 0, y: 0 };

function getClickableMeshes() {
  if (state.viewMode === 'focus') {
    return focusGroup.children.filter(c => c.name === 'focusPiece');
  }
  return [];
}

// Hover cursor with smart axis snapping (active in Part Focus mode only)
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!state.loadedGeometry || state.viewMode !== 'focus') {
    hoverMarker.visible = false;
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const meshes = getClickableMeshes();
  const intersects = raycaster.intersectObjects(meshes, false);

  if (intersects.length > 0) {
    const hit = intersects[0];
    let localPoint = hit.object.worldToLocal(hit.point.clone());

    let isSnappedX = false;
    let isSnappedY = false;

    if (state.enableSnapping && state.showGuides) {
      const snapThreshold = 1.2;
      if (Math.abs(localPoint.x) < snapThreshold) {
        localPoint.x = 0;
        isSnappedX = true;
      }
      if (Math.abs(localPoint.y) < snapThreshold) {
        localPoint.y = 0;
        isSnappedY = true;
      }
    }

    const snappedWorld = hit.object.localToWorld(localPoint.clone());
    hoverMarker.position.copy(snappedWorld);
    hoverMarker.visible = true;

    const pickingStatusText = document.getElementById('pickingStatusText');
    if (pickingStatusText) {
      if (isSnappedX || isSnappedY) {
        hoverSphere.material.color.setHex(0x10b981);
        const snapTxt = isSnappedX && isSnappedY ? 'Center (X=0, Y=0)' : (isSnappedX ? 'Axis X=0' : 'Axis Y=0');
        pickingStatusText.textContent = `🎯 Snapped to ${snapTxt} - Click to place`;
      } else {
        hoverSphere.material.color.setHex(0x38bdf8);
        const activeName = state.activeGateSlot === 1 ? 'Gate 1' : 'Gate 2';
        pickingStatusText.textContent = `Click on model to place ${activeName} (connects to nearest runner)`;
      }
    }
  } else {
    hoverMarker.visible = false;
  }
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDownCoord.x = e.clientX;
  pointerDownCoord.y = e.clientY;
});

renderer.domElement.addEventListener('pointerup', (e) => {
  const dx = Math.abs(e.clientX - pointerDownCoord.x);
  const dy = Math.abs(e.clientY - pointerDownCoord.y);
  if (dx < 5 && dy < 5 && state.loadedGeometry && state.viewMode === 'focus') {
    handlePickingClick(e);
  }
});

function handlePickingClick(e) {
  if (!state.loadedGeometry || state.viewMode !== 'focus') return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const meshes = getClickableMeshes();
  const intersects = raycaster.intersectObjects(meshes, false);

  if (intersects.length > 0) {
    const hit = intersects[0];
    let localPoint = hit.object.worldToLocal(hit.point.clone());
    let localNormal = hit.face.normal.clone();

    if (state.enableSnapping && state.showGuides) {
      const snapThreshold = 1.2;
      if (Math.abs(localPoint.x) < snapThreshold) localPoint.x = 0;
      if (Math.abs(localPoint.y) < snapThreshold) localPoint.y = 0;
    }

    if (state.autoSymmetry) {
      setGate1(localPoint, localNormal);
      applyAutoSymmetricGate2(localPoint, localNormal);
      const pickingStatusText = document.getElementById('pickingStatusText');
      if (pickingStatusText) {
        pickingStatusText.textContent = 'Symmetric gates placed successfully ✓';
      }
    } else {
      if (state.activeGateSlot === 1) {
        setGate1(localPoint, localNormal);
      } else {
        setGate2(localPoint, localNormal);
      }
    }
  }
}

export function applyAutoSymmetricGate2(p1, n1) {
  let p2 = new THREE.Vector3(p1.x, -p1.y, p1.z);
  let n2 = new THREE.Vector3(n1.x, -n1.y, n1.z);

  const focusMesh = focusGroup.getObjectByName('focusPiece');
  if (focusMesh) {
    const testRay = new THREE.Raycaster();
    const box = state.originalBBox;
    const startY = p1.y >= 0 ? -box.max.y - 30 : box.max.y + 30;
    const dirY = p1.y >= 0 ? 1 : -1;
    testRay.set(new THREE.Vector3(p1.x, startY, p1.z), new THREE.Vector3(0, dirY, 0));
    const hits = testRay.intersectObject(focusMesh, false);
    if (hits.length > 0) {
      p2.copy(hits[0].point);
      n2.copy(hits[0].face.normal);
    }
  }

  setGate2(p2, n2);
  const pickingStatusText = document.getElementById('pickingStatusText');
  if (pickingStatusText) {
    pickingStatusText.textContent = 'Symmetric Gates 1 & 2 placed successfully ✓';
  }
}

const inputG1X = document.getElementById('inputG1X');
const inputG1Y = document.getElementById('inputG1Y');
const inputG1Z = document.getElementById('inputG1Z');
const inputG2X = document.getElementById('inputG2X');
const inputG2Y = document.getElementById('inputG2Y');
const inputG2Z = document.getElementById('inputG2Z');

export function setGate1(point, normal) {
  state.gate1Picked = true;
  state.gate1Point.copy(point);
  state.gate1Normal.copy(normal).normalize();

  if (inputG1X) inputG1X.value = state.gate1Point.x.toFixed(2);
  if (inputG1Y) inputG1Y.value = state.gate1Point.y.toFixed(2);
  if (inputG1Z) inputG1Z.value = state.gate1Point.z.toFixed(2);
  const st1 = document.getElementById('statusGate1');
  if (st1) {
    st1.textContent = 'Defined ✓';
    st1.className = 'text-emerald-400 font-mono text-[10px] font-bold';
  }

  if (state.autoSymmetry) {
    applyAutoSymmetricGate2(state.gate1Point, state.gate1Normal);
  } else {
    autoOptimizeLayout();
    updateMarkers();
  }
}

export function setGate2(point, normal) {
  state.gate2Picked = true;
  state.gate2Point.copy(point);
  state.gate2Normal.copy(normal).normalize();

  if (inputG2X) inputG2X.value = state.gate2Point.x.toFixed(2);
  if (inputG2Y) inputG2Y.value = state.gate2Point.y.toFixed(2);
  if (inputG2Z) inputG2Z.value = state.gate2Point.z.toFixed(2);
  const st2 = document.getElementById('statusGate2');
  if (st2) {
    st2.textContent = 'Defined ✓';
    st2.className = 'text-rose-400 font-mono text-[10px] font-bold';
  }

  autoOptimizeLayout();
  updateMarkers();
}

function onManualGate1Change() {
  state.gate1Point.x = parseFloat(inputG1X?.value) || 0;
  state.gate1Point.y = parseFloat(inputG1Y?.value) || 0;
  state.gate1Point.z = parseFloat(inputG1Z?.value) || 0;
  state.gate1Picked = true;

  if (state.autoSymmetry) {
    applyAutoSymmetricGate2(state.gate1Point, state.gate1Normal);
  } else {
    autoOptimizeLayout();
    updateMarkers();
  }
}
if (inputG1X) [inputG1X, inputG1Y, inputG1Z].forEach(inp => {
  inp?.addEventListener('input', onManualGate1Change);
  inp?.addEventListener('change', onManualGate1Change);
});

function onManualGate2Change() {
  state.gate2Point.x = parseFloat(inputG2X?.value) || 0;
  state.gate2Point.y = parseFloat(inputG2Y?.value) || 0;
  state.gate2Point.z = parseFloat(inputG2Z?.value) || 0;
  state.gate2Picked = true;

  autoOptimizeLayout();
  updateMarkers();
}
if (inputG2X) [inputG2X, inputG2Y, inputG2Z].forEach(inp => {
  inp?.addEventListener('input', onManualGate2Change);
  inp?.addEventListener('change', onManualGate2Change);
});

export function selectGateSlot(slot) {
  state.activeGateSlot = slot;
  const b1 = document.getElementById('btnSelectGate1');
  const b2 = document.getElementById('btnSelectGate2');
  const statusText = document.getElementById('pickingStatusText');
  const pulseDot = document.getElementById('pickingPulseDot');

  if (slot === 1) {
    if (b1) b1.className = 'py-1.5 px-2 rounded-lg font-semibold text-center transition bg-emerald-600 text-white flex items-center justify-center gap-1.5 text-xs shadow-sm cursor-pointer';
    if (b2) b2.className = 'py-1.5 px-2 rounded-lg font-medium text-center transition bg-slate-50 text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-1.5 text-xs border border-slate-200 cursor-pointer';
    if (statusText) statusText.textContent = 'Click on model to place Gate 1 • Connects to nearest runner';
    if (pulseDot) pulseDot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
  } else {
    if (b2) b2.className = 'py-1.5 px-2 rounded-lg font-semibold text-center transition bg-rose-600 text-white flex items-center justify-center gap-1.5 text-xs shadow-sm cursor-pointer';
    if (b1) b1.className = 'py-1.5 px-2 rounded-lg font-medium text-center transition bg-slate-50 text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-1.5 text-xs border border-slate-200 cursor-pointer';
    if (statusText) statusText.textContent = 'Click on model to place Gate 2 • Connects to nearest runner';
    if (pulseDot) pulseDot.className = 'w-2 h-2 rounded-full bg-rose-500 animate-pulse';
  }
}

document.getElementById('btnSelectGate1')?.addEventListener('click', () => selectGateSlot(1));
document.getElementById('btnSelectGate2')?.addEventListener('click', () => selectGateSlot(2));

// Automatic initial detection of 2 opposite gate points (Front / Back along Y runners)
export function autoDetectOppositeGates() {
  if (!state.loadedGeometry) return;
  const box = state.originalBBox;
  const focusMesh = focusGroup.getObjectByName('focusPiece');
  const testRay = new THREE.Raycaster();

  let p1 = new THREE.Vector3(0, box.max.y, 0);
  let n1 = new THREE.Vector3(0, 1, 0);
  let p2 = new THREE.Vector3(0, box.min.y, 0);
  let n2 = new THREE.Vector3(0, -1, 0);

  if (focusMesh) {
    testRay.set(new THREE.Vector3(0, box.max.y + 20, 0), new THREE.Vector3(0, -1, 0));
    const h1 = testRay.intersectObject(focusMesh, false);
    if (h1.length > 0) { p1.copy(h1[0].point); n1.copy(h1[0].face.normal); }

    testRay.set(new THREE.Vector3(0, box.min.y - 20, 0), new THREE.Vector3(0, 1, 0));
    const h2 = testRay.intersectObject(focusMesh, false);
    if (h2.length > 0) { p2.copy(h2[0].point); n2.copy(h2[0].face.normal); }
  }

  setGate1(p1, n1);
  setGate2(p2, n2);
  selectGateSlot(1);
}

export function swapGatePoints() {
  if (!state.gate1Picked && !state.gate2Picked) return;

  const tempP = state.gate1Point.clone();
  state.gate1Point.copy(state.gate2Point);
  state.gate2Point.copy(tempP);

  const tempN = state.gate1Normal.clone();
  state.gate1Normal.copy(state.gate2Normal);
  state.gate2Normal.copy(tempN);

  const tempPicked = state.gate1Picked;
  state.gate1Picked = state.gate2Picked;
  state.gate2Picked = tempPicked;

  if (inputG1X) inputG1X.value = state.gate1Point.x.toFixed(2);
  if (inputG1Y) inputG1Y.value = state.gate1Point.y.toFixed(2);
  if (inputG1Z) inputG1Z.value = state.gate1Point.z.toFixed(2);
  if (inputG2X) inputG2X.value = state.gate2Point.x.toFixed(2);
  if (inputG2Y) inputG2Y.value = state.gate2Point.y.toFixed(2);
  if (inputG2Z) inputG2Z.value = state.gate2Point.z.toFixed(2);

  const s1 = document.getElementById('statusGate1');
  const s2 = document.getElementById('statusGate2');
  if (s1) {
    s1.textContent = state.gate1Picked ? 'Defined ✓' : 'Not defined';
    s1.className = state.gate1Picked ? 'text-emerald-400 font-mono text-[10px] font-bold' : 'text-slate-400 font-mono text-[10px]';
  }
  if (s2) {
    s2.textContent = state.gate2Picked ? 'Defined ✓' : 'Not defined';
    s2.className = state.gate2Picked ? 'text-rose-400 font-mono text-[10px] font-bold' : 'text-slate-400 font-mono text-[10px]';
  }

  updateMarkers();
  rebuildSprue();
}

// Visual Gate Markers
export function updateMarkers() {
  while (markersGroup.children.length > 0) {
    const obj = markersGroup.children[0];
    markersGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
  }

  if (state.gate1Picked) {
    const s1 = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    s1.position.copy(state.gate1Point);
    markersGroup.add(s1);

    const a1 = new THREE.ArrowHelper(state.gate1Normal, state.gate1Point, 6.0, 0x10b981, 1.4, 0.8);
    markersGroup.add(a1);
  }

  if (state.gate2Picked) {
    const s2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xf43f5e })
    );
    s2.position.copy(state.gate2Point);
    markersGroup.add(s2);

    const a2 = new THREE.ArrowHelper(state.gate2Normal, state.gate2Point, 6.0, 0xf43f5e, 1.4, 0.8);
    markersGroup.add(a2);
  }
}

// ──────────────────────────────────────────────────────────────
// SPRUE REBUILDING & FOCUS PREVIEW
// ──────────────────────────────────────────────────────────────
export function rebuildSprue() {
  while (sprueGroup.children.length > 0) {
    const obj = sprueGroup.children[0];
    sprueGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
  }

  if (!state.loadedGeometry) return;

  const bounds = computeSprueBounds(state);
  const halfFrameD = state.frameWidth / 2;

  // 1. Array Parts and attachments
  bounds.rowPositions.forEach((rp, rIdx) => {
    for (let c = 0; c < bounds.cols; c++) {
      const posX = (c - (bounds.cols - 1) / 2) * state.spacing;
      const posY = rp.y;

      const pieceMesh = new THREE.Mesh(state.loadedGeometry, pieceMaterial);
      pieceMesh.name = `spruePiece_${rIdx}_${c}`;
      pieceMesh.position.set(posX, posY, 0);
      pieceMesh.rotation.z = rp.rotZ;
      sprueGroup.add(pieceMesh);

      // Gate 1 attach
      if (state.gate1Picked) {
        const pTouch = state.gate1Point.clone().add(new THREE.Vector3(posX, posY, 0));
        const pSupport = getClosestSupportOnSprue(pTouch, rIdx, c, bounds);
        createSubdividedAttache(pSupport, pTouch, sprueGroup, tabMaterial, state, frameMaterial);
      }

      // Gate 2 attach
      if (state.gate2Picked && state.enableFrame) {
        const pTouch = state.gate2Point.clone().add(new THREE.Vector3(posX, posY, 0));
        const pSupport = getClosestSupportOnSprue(pTouch, rIdx, c, bounds);
        createSubdividedAttache(pSupport, pTouch, sprueGroup, tabMaterial, state, frameMaterial);
      }
    }
  });

  // 2. Rectangular outer frame
  if (state.enableFrame) {
    sprueGroup.add(createPoutreMesh(new THREE.Vector3(bounds.xMin, bounds.yMin, bounds.zAttach), new THREE.Vector3(bounds.xMax, bounds.yMin, bounds.zAttach), halfFrameD, frameMaterial));
    sprueGroup.add(createPoutreMesh(new THREE.Vector3(bounds.xMin, bounds.yMax, bounds.zAttach), new THREE.Vector3(bounds.xMax, bounds.yMax, bounds.zAttach), halfFrameD, frameMaterial));
    sprueGroup.add(createPoutreMesh(new THREE.Vector3(bounds.xMin, bounds.yMin, bounds.zAttach), new THREE.Vector3(bounds.xMin, bounds.yMax, bounds.zAttach), halfFrameD, frameMaterial));
    sprueGroup.add(createPoutreMesh(new THREE.Vector3(bounds.xMax, bounds.yMin, bounds.zAttach), new THREE.Vector3(bounds.xMax, bounds.yMax, bounds.zAttach), halfFrameD, frameMaterial));
  }

  // 3. Intermediate horizontal runners
  bounds.intermediateRails.forEach(rY => {
    sprueGroup.add(createPoutreMesh(new THREE.Vector3(bounds.xMin, rY, bounds.zAttach), new THREE.Vector3(bounds.xMax, rY, bounds.zAttach), halfFrameD, frameMaterial));
  });

  // Dimensions & Cost footprint
  const totalWidthX = bounds.xMax - bounds.xMin;
  const totalDepthY = bounds.yMax - bounds.yMin;
  const minZ = Math.min(-state.dimensions.z / 2, bounds.zAttach - halfFrameD);
  const maxZ = Math.max(state.dimensions.z / 2, bounds.zAttach + halfFrameD);
  const totalHeightZ = Math.max(maxZ - minZ, 0.1);
  const volumeCm3 = (totalWidthX * totalDepthY * totalHeightZ) / 1000;

  const elBBox = document.getElementById('valSprueBBoxDim');
  const elVol = document.getElementById('valSprueVolume');
  const elZ = document.getElementById('valSprueHeightZ');
  const elBadge = document.getElementById('badgeSavingRate');
  if (elBBox && elVol && elZ) {
    elBBox.textContent = `${totalWidthX.toFixed(0)} × ${totalDepthY.toFixed(0)} × ${totalHeightZ.toFixed(1)}`;
    elVol.textContent = volumeCm3.toFixed(1);
    elZ.textContent = totalHeightZ.toFixed(1);
    if (elBadge) {
      elBadge.textContent = state.structureZMode === 'flat_bottom' ? 'Optimal Z Minimal ✓' : 'Centered Mode';
      elBadge.className = state.structureZMode === 'flat_bottom'
        ? 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200'
        : 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200';
    }
  }

  updateFocusSpruePreview();
  updateViewModeVisibility();
}

// Transparent Preview in Part Focus Mode (Top & Bottom Runners only)
export function updateFocusSpruePreview() {
  while (focusSpruePreviewGroup.children.length > 0) {
    const obj = focusSpruePreviewGroup.children[0];
    focusSpruePreviewGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
  }

  if (!state.loadedGeometry) return;

  const halfSizeX = state.dimensions.x / 2;
  const halfSizeY = state.dimensions.y / 2;
  const clearance = Math.max(state.frameWidth / 2 + 1.2, 2.2);
  const halfFrameD = state.frameWidth / 2;

  const xMin = - (halfSizeX + clearance + halfFrameD);
  const xMax = (halfSizeX + clearance + halfFrameD);
  const yMin = - (halfSizeY + clearance + halfFrameD);
  const yMax = (halfSizeY + clearance + halfFrameD);

  const zAttach = (state.structureZMode === 'flat_bottom')
    ? (-state.dimensions.z / 2 + halfFrameD)
    : ((state.gate1Picked && state.gate2Picked) ? (state.gate1Point.z + state.gate2Point.z) / 2 : 0);

  // Top & bottom horizontal runners only
  const railExtensionX = Math.max(state.dimensions.x * 0.25, 4.0);
  const railXMin = xMin - railExtensionX;
  const railXMax = xMax + railExtensionX;

  if (state.enableFrame) {
    focusSpruePreviewGroup.add(createPoutreMesh(new THREE.Vector3(railXMin, yMin, zAttach), new THREE.Vector3(railXMax, yMin, zAttach), halfFrameD, ghostFrameMaterial));
    focusSpruePreviewGroup.add(createPoutreMesh(new THREE.Vector3(railXMin, yMax, zAttach), new THREE.Vector3(railXMax, yMax, zAttach), halfFrameD, ghostFrameMaterial));
  }

  function getClosestTopBottomSupport(pTouch) {
    const dB = Math.abs(pTouch.y - yMin);
    const dT = Math.abs(yMax - pTouch.y);
    const targetY = (dB <= dT) ? yMin : yMax;
    const clampedX = Math.max(xMin, Math.min(xMax, pTouch.x));
    return new THREE.Vector3(clampedX, targetY, zAttach);
  }

  if (state.gate1Picked) {
    const pTouch1 = state.gate1Point.clone();
    const pSupport1 = getClosestTopBottomSupport(pTouch1);
    createSubdividedAttache(pSupport1, pTouch1, focusSpruePreviewGroup, ghostTabMaterial, state, ghostFrameMaterial);
  }

  if (state.gate2Picked && state.enableFrame) {
    const pTouch2 = state.gate2Point.clone();
    const pSupport2 = getClosestTopBottomSupport(pTouch2);
    createSubdividedAttache(pSupport2, pTouch2, focusSpruePreviewGroup, ghostTabMaterial, state, ghostFrameMaterial);
  }
}

// ──────────────────────────────────────────────────────────────
// VIEW MODE SWITCHER (FOCUS VS BATCH SPRUE)
// ──────────────────────────────────────────────────────────────
const btnViewFocus = document.getElementById('btnViewFocus');
const btnViewSprue = document.getElementById('btnViewSprue');
const tabModeFocus = document.getElementById('tabModeFocus');
const tabModeSprue = document.getElementById('tabModeSprue');

export function setViewMode(mode) {
  state.viewMode = mode;

  if (btnViewFocus && btnViewSprue) {
    if (mode === 'focus') {
      btnViewFocus.className = 'px-2.5 py-1 rounded-md bg-indigo-600 text-white font-medium text-xs shadow-sm transition flex items-center gap-1 cursor-pointer';
      btnViewSprue.className = 'px-2.5 py-1 rounded-md text-slate-500 hover:text-slate-800 font-medium text-xs transition flex items-center gap-1 cursor-pointer';
    } else {
      btnViewSprue.className = 'px-2.5 py-1 rounded-md bg-indigo-600 text-white font-medium text-xs shadow-sm transition flex items-center gap-1 cursor-pointer';
      btnViewFocus.className = 'px-2.5 py-1 rounded-md text-slate-500 hover:text-slate-800 font-medium text-xs transition flex items-center gap-1 cursor-pointer';
    }
  }

  if (tabModeFocus && tabModeSprue) {
    if (mode === 'focus') {
      tabModeFocus.className = 'flex-1 py-2 px-3 rounded-lg bg-white text-indigo-600 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm border border-slate-200/80 cursor-pointer transition';
      tabModeSprue.className = 'flex-1 py-2 px-3 rounded-lg text-slate-500 hover:text-slate-800 font-medium text-xs flex items-center justify-center gap-1.5 hover:bg-white/50 cursor-pointer transition';
    } else {
      tabModeSprue.className = 'flex-1 py-2 px-3 rounded-lg bg-white text-indigo-600 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm border border-slate-200/80 cursor-pointer transition';
      tabModeFocus.className = 'flex-1 py-2 px-3 rounded-lg text-slate-500 hover:text-slate-800 font-medium text-xs flex items-center justify-center gap-1.5 hover:bg-white/50 cursor-pointer transition';
    }
  }

  const viewportContainer = document.getElementById('viewportContainer');
  if (viewportContainer) {
    if (mode === 'focus') {
      viewportContainer.classList.add('crosshair-cursor');
    } else {
      viewportContainer.classList.remove('crosshair-cursor');
      hoverMarker.visible = false;
    }
  }

  const pickingNotice = document.getElementById('pickingNotice');
  const pickingStatusText = document.getElementById('pickingStatusText');
  if (pickingNotice && pickingStatusText) {
    if (mode === 'focus') {
      pickingNotice.classList.remove('hidden');
      if (state.autoSymmetry) {
        pickingStatusText.textContent = 'Click model to place gate • Opposite side auto-mirrored';
      } else {
        const activeGate = state.activeGateSlot === 1 ? 'Gate 1' : 'Gate 2';
        pickingStatusText.textContent = `Click on part to place ${activeGate} • Connects to nearest runner`;
      }
    } else {
      pickingNotice.classList.add('hidden');
    }
  }

  const isFocus = (mode === 'focus');
  const sectionPoints = document.getElementById('sectionPoints');
  const sectionGrid = document.getElementById('sectionGrid');
  const costSavingsWidget = document.getElementById('costSavingsWidget');
  const titleDimensionsSection = document.getElementById('titleDimensionsSection');
  const btnNextStep = document.getElementById('btnNextStep');
  const btnExportSTL = document.getElementById('btnExportSTL');
  const btnPrevStep = document.getElementById('btnPrevStep');

  if (sectionPoints) sectionPoints.classList.toggle('hidden', !isFocus);
  if (sectionGrid) sectionGrid.classList.toggle('hidden', isFocus);
  if (costSavingsWidget) costSavingsWidget.classList.toggle('hidden', isFocus);

  if (btnNextStep && btnExportSTL && btnPrevStep) {
    if (isFocus) {
      btnNextStep.classList.remove('hidden');
      btnExportSTL.classList.add('hidden');
      btnPrevStep.classList.add('hidden');
    } else {
      btnNextStep.classList.add('hidden');
      btnExportSTL.classList.remove('hidden');
      btnPrevStep.classList.remove('hidden');
    }
  }

  if (titleDimensionsSection) {
    titleDimensionsSection.textContent = isFocus ? '2. Tab & Runner Dimensions' : '2. Frame & Tab Dimensions';
  }

  updateViewModeVisibility();
  if (state.loadedGeometry) {
    fitCameraToObject(state.loadedGeometry);
  }
}

btnViewFocus?.addEventListener('click', () => setViewMode('focus'));
btnViewSprue?.addEventListener('click', () => setViewMode('sprue'));
tabModeFocus?.addEventListener('click', () => setViewMode('focus'));
tabModeSprue?.addEventListener('click', () => setViewMode('sprue'));

export function updateViewModeVisibility() {
  if (state.viewMode === 'focus') {
    focusGroup.visible = true;
    focusSpruePreviewGroup.visible = true;
    sprueGroup.visible = false;
    markersGroup.visible = true;
    guidesGroup.visible = state.showGuides;
  } else {
    focusGroup.visible = false;
    focusSpruePreviewGroup.visible = false;
    sprueGroup.visible = true;
    markersGroup.visible = true;
    guidesGroup.visible = false;
  }
}

// ──────────────────────────────────────────────────────────────
// SIDEBAR CONTROLS & EVENT LISTENERS
// ──────────────────────────────────────────────────────────────
document.getElementById('btnResetCamera')?.addEventListener('click', () => {
  if (state.loadedGeometry) fitCameraToObject(state.loadedGeometry);
});

// Dimensions & Sliders
const rangeFrameWidth = document.getElementById('rangeFrameWidth');
const valFrameWidth = document.getElementById('valFrameWidth');
rangeFrameWidth?.addEventListener('input', (e) => {
  state.frameWidth = parseFloat(e.target.value);
  if (valFrameWidth) valFrameWidth.textContent = state.frameWidth.toFixed(1);

  state.bodyDiameter = Math.round(state.frameWidth * 0.7 * 10) / 10;
  autoOptimizeLayout();
});

const rangeNeckLength = document.getElementById('rangeNeckLength');
const valNeckLength = document.getElementById('valNeckLength');
rangeNeckLength?.addEventListener('input', (e) => {
  state.neckLength = parseFloat(e.target.value);
  if (valNeckLength) valNeckLength.textContent = state.neckLength.toFixed(1);
  rebuildSprue();
});

const rangeNeckDiameter = document.getElementById('rangeNeckDiameter');
const valNeckDiameter = document.getElementById('valNeckDiameter');
rangeNeckDiameter?.addEventListener('input', (e) => {
  state.neckDiameter = parseFloat(e.target.value);
  if (valNeckDiameter) valNeckDiameter.textContent = state.neckDiameter.toFixed(2);
  rebuildSprue();
});

// Grid rows & cols
const inputRows = document.getElementById('inputRows');
const inputCols = document.getElementById('inputCols');
const badgeTotalPieces = document.getElementById('badgeTotalPieces');

function updateGrid(r, c) {
  r = Math.max(1, Math.min(10, parseInt(r) || 1));
  c = Math.max(1, Math.min(25, parseInt(c) || 1));
  state.rows = r;
  state.cols = c;
  if (inputRows) inputRows.value = r;
  if (inputCols) inputCols.value = c;
  const total = r * c;
  if (badgeTotalPieces) badgeTotalPieces.textContent = `${total} part${total > 1 ? 's' : ''} (${r} × ${c})`;
  rebuildSprue();
}

inputRows?.addEventListener('change', (e) => updateGrid(e.target.value, state.cols));
inputCols?.addEventListener('change', (e) => updateGrid(state.rows, e.target.value));
document.getElementById('btnDecRows')?.addEventListener('click', () => updateGrid(state.rows - 1, state.cols));
document.getElementById('btnIncRows')?.addEventListener('click', () => updateGrid(state.rows + 1, state.cols));
document.getElementById('btnDecCols')?.addEventListener('click', () => updateGrid(state.rows, state.cols - 1));
document.getElementById('btnIncCols')?.addEventListener('click', () => updateGrid(state.rows, state.cols + 1));

// Part Orientation (Z axis only)
document.getElementById('btnRotZPlus')?.addEventListener('click', () => rotateGeometry('z', Math.PI / 2));

// Gate Placement Mode Switcher (Symmetric 1-Point vs Independent 2-Points)
const btnModeSymmetric = document.getElementById('btnModeSymmetric');
const btnModeIndependent = document.getElementById('btnModeIndependent');
const containerSymmetricHelp = document.getElementById('containerSymmetricHelp');
const containerIndependentGates = document.getElementById('containerIndependentGates');

export function setSymmetryMode(enabled) {
  state.autoSymmetry = enabled;
  if (enabled) {
    if (btnModeSymmetric) {
      btnModeSymmetric.className = 'flex-1 py-1 px-2 rounded-md bg-white text-indigo-600 font-semibold shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer';
    }
    if (btnModeIndependent) {
      btnModeIndependent.className = 'flex-1 py-1 px-2 rounded-md text-slate-500 hover:text-slate-800 font-medium flex items-center justify-center gap-1.5 transition cursor-pointer';
    }
    if (containerSymmetricHelp) containerSymmetricHelp.classList.remove('hidden');
    if (containerIndependentGates) containerIndependentGates.classList.add('hidden');

    state.activeGateSlot = 1;
    if (state.gate1Picked) {
      applyAutoSymmetricGate2(state.gate1Point, state.gate1Normal);
    }
    const pickingStatusText = document.getElementById('pickingStatusText');
    if (pickingStatusText && state.viewMode === 'focus') {
      pickingStatusText.textContent = 'Click model to place gate • Opposite side auto-mirrored';
    }
  } else {
    if (btnModeIndependent) {
      btnModeIndependent.className = 'flex-1 py-1 px-2 rounded-md bg-white text-indigo-600 font-semibold shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer';
    }
    if (btnModeSymmetric) {
      btnModeSymmetric.className = 'flex-1 py-1 px-2 rounded-md text-slate-500 hover:text-slate-800 font-medium flex items-center justify-center gap-1.5 transition cursor-pointer';
    }
    if (containerSymmetricHelp) containerSymmetricHelp.classList.add('hidden');
    if (containerIndependentGates) containerIndependentGates.classList.remove('hidden');

    selectGateSlot(state.activeGateSlot || 1);
  }
}

btnModeSymmetric?.addEventListener('click', () => setSymmetryMode(true));
btnModeIndependent?.addEventListener('click', () => setSymmetryMode(false));
setSymmetryMode(true);

// Step Navigation Listeners
document.getElementById('btnNextStep')?.addEventListener('click', () => {
  setViewMode('sprue');
});
document.getElementById('btnPrevStep')?.addEventListener('click', () => {
  setViewMode('focus');
});

// STL Export Click
document.getElementById('btnExportSTL')?.addEventListener('click', () => {
  exportMergedSTL(state);
});

// FAQ Modal
const faqModal = document.getElementById('faqModal');
const btnOpenFaq = document.getElementById('btnOpenFaq');
const btnCloseFaq = document.getElementById('btnCloseFaq');
const btnFaqUnderstood = document.getElementById('btnFaqUnderstood');

function openFaqModal() { if (faqModal) faqModal.classList.remove('hidden'); }
function closeFaqModal() { if (faqModal) faqModal.classList.add('hidden'); }

btnOpenFaq?.addEventListener('click', openFaqModal);
btnCloseFaq?.addEventListener('click', closeFaqModal);
btnFaqUnderstood?.addEventListener('click', closeFaqModal);
if (faqModal) {
  faqModal.addEventListener('click', (e) => {
    if (e.target === faqModal) closeFaqModal();
  });
}

// ──────────────────────────────────────────────────────────────
// ANIMATION LOOP (60 FPS)
// ──────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  if (activeControls && (!viewCubeManager || !viewCubeManager.isAnimating())) {
    activeControls.update();
  }
  if (viewCubeManager?.updateViewCubeRotation) {
    viewCubeManager.updateViewCubeRotation();
  }
  renderer.render(scene, camera);
}
animate();
