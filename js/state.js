import * as THREE from 'three';

export const state = {
  rawFileName: 'piece.stl',
  loadedGeometry: null,
  originalBBox: new THREE.Box3(),
  dimensions: new THREE.Vector3(1, 1, 1),
  
  // View mode: 'sprue' (batch sprue) | 'focus' (single part focus)
  viewMode: 'focus',
  showGrid: true,
  cameraMode: 'orthographic', // 'perspective' | 'orthographic'

  // 2 Gate points per part
  activeGateSlot: 1, // 1: Gate 1, 2: Gate 2
  gate1Picked: false,
  gate1Point: new THREE.Vector3(0, 0, 0),
  gate1Normal: new THREE.Vector3(0, 1, 0),

  gate2Picked: false,
  gate2Point: new THREE.Vector3(0, 0, 0),
  gate2Normal: new THREE.Vector3(0, -1, 0),

  // Individual lengths
  gate1Length: 5.0,
  gate2Length: 6.0,

  // Cage & Profile Dimensions
  enableFrame: true,
  frameWidth: 3.0,          // Ø perimeter frame & intermediate rails
  neckDiameter: 1.2,        // Ø thin breakaway neck at part surface
  neckLength: 1.0,          // Length of thin breakaway neck
  bodyDiameter: 2.1,        // Ø thick tab stem (0.7 × frameWidth)
  embedDepth: 0.0,          // ZERO penetration: attach strictly meets part surface without entering

  // Grid (Rows and Columns)
  rows: 2,                  // Number of rows (Y axis)
  cols: 5,                  // Number of columns (X axis)
  spacing: 22.0,            // Center-to-center part pitch along runner

  // Orientation & Rotation
  totalRotation: { x: 0, y: 0, z: 0 },
  originalRawGeometry: null,

  // Smart helpers & Symmetry
  showGuides: true,
  enableSnapping: true,
  autoSymmetry: false,

  // Z-level alignment
  structureZMode: 'flat_bottom' // 'flat_bottom': resting flat on bed (Z=0) | 'centered'
};
