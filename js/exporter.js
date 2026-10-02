import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { computeSprueBounds, getClosestSupportOnSprue } from './sprueLayout.js';
import { createCylinderGeometryBetween, addSubdividedAttacheGeoms, triggerDownload } from './geometry.js';

export async function exportMergedSTL(state) {
  if (!state.loadedGeometry) return;

  const isFocus = (state.viewMode === 'focus');
  const statusEl = document.getElementById('exportStatus');
  const btnText = document.getElementById('btnExportText');
  if (statusEl) {
    statusEl.classList.remove('hidden');
    statusEl.textContent = 'Merging 3D meshes...';
  }
  if (btnText) {
    btnText.textContent = 'Generating binary STL...';
  }

  await new Promise(r => setTimeout(r, 60));

  try {
    const bounds = computeSprueBounds(state);
    const halfFrameD = state.frameWidth / 2;
    const geomsToMerge = [];

    // 1. Part geometries and breakaway tabs for each row
    bounds.rowPositions.forEach((rp, rIdx) => {
      for (let c = 0; c < bounds.cols; c++) {
        const posX = (c - (bounds.cols - 1) / 2) * state.spacing;
        const posY = rp.y;

        const pGeom = state.loadedGeometry.clone();
        if (rp.rotZ !== 0) {
          pGeom.rotateZ(rp.rotZ);
        }
        pGeom.translate(posX, posY, 0);
        geomsToMerge.push(pGeom);

        // Gate 1 attachment
        if (state.gate1Picked) {
          const pTouch = state.gate1Point.clone().add(new THREE.Vector3(posX, posY, 0));
          const pSupport = getClosestSupportOnSprue(pTouch, rIdx, c, bounds);
          addSubdividedAttacheGeoms(pSupport, pTouch, geomsToMerge, state);
        }

        // Gate 2 attachment
        if (state.gate2Picked && state.enableFrame) {
          const pTouch = state.gate2Point.clone().add(new THREE.Vector3(posX, posY, 0));
          const pSupport = getClosestSupportOnSprue(pTouch, rIdx, c, bounds);
          addSubdividedAttacheGeoms(pSupport, pTouch, geomsToMerge, state);
        }
      }
    });

    // 2. Rectangular perimeter frame
    if (state.enableFrame) {
      geomsToMerge.push(createCylinderGeometryBetween(new THREE.Vector3(bounds.xMin, bounds.yMin, bounds.zAttach), new THREE.Vector3(bounds.xMax, bounds.yMin, bounds.zAttach), halfFrameD));
      geomsToMerge.push(createCylinderGeometryBetween(new THREE.Vector3(bounds.xMin, bounds.yMax, bounds.zAttach), new THREE.Vector3(bounds.xMax, bounds.yMax, bounds.zAttach), halfFrameD));
      geomsToMerge.push(createCylinderGeometryBetween(new THREE.Vector3(bounds.xMin, bounds.yMin, bounds.zAttach), new THREE.Vector3(bounds.xMin, bounds.yMax, bounds.zAttach), halfFrameD));
      geomsToMerge.push(createCylinderGeometryBetween(new THREE.Vector3(bounds.xMax, bounds.yMin, bounds.zAttach), new THREE.Vector3(bounds.xMax, bounds.yMax, bounds.zAttach), halfFrameD));
    }

    // 3. Intermediate horizontal runners
    bounds.intermediateRails.forEach(rY => {
      geomsToMerge.push(createCylinderGeometryBetween(new THREE.Vector3(bounds.xMin, rY, bounds.zAttach), new THREE.Vector3(bounds.xMax, rY, bounds.zAttach), halfFrameD));
    });

    // 4. Geometry normalization for clean BufferGeometry merge
    const normalizedGeoms = geomsToMerge.map(g => {
      const clean = g.index ? g.toNonIndexed() : g;
      const finalGeom = new THREE.BufferGeometry();
      finalGeom.setAttribute('position', clean.attributes.position.clone());
      if (clean.attributes.normal) {
        finalGeom.setAttribute('normal', clean.attributes.normal.clone());
      } else {
        finalGeom.computeVertexNormals();
      }
      return finalGeom;
    });

    // 5. Global mesh merge
    const mergedGeometry = BufferGeometryUtils.mergeGeometries(normalizedGeoms, false);
    if (!mergedGeometry) {
      throw new Error("Unable to merge sprue geometries (incompatible vertex attributes).");
    }

    // 6. Binary STL export
    const exporter = new STLExporter();
    const binaryStlData = exporter.parse(new THREE.Mesh(mergedGeometry), { binary: true });

    // Clean memory
    geomsToMerge.forEach(g => g.dispose());
    normalizedGeoms.forEach(g => g.dispose());
    mergedGeometry.dispose();

    // Trigger download
    const baseName = state.rawFileName.replace(/\.[^/.]+$/, '');
    const filename = isFocus
      ? `part_cage_${baseName}.stl`
      : `sprue_${state.rows}x${state.cols}_${baseName}_cage.stl`;
    triggerDownload(new Blob([binaryStlData], { type: 'application/octet-stream' }), filename);

  } catch (err) {
    console.error(err);
    alert('Error generating STL: ' + err.message);
  } finally {
    if (statusEl) statusEl.classList.add('hidden');
    if (btnText) btnText.textContent = isFocus ? 'Download Part Cage STL' : 'Download Batch Sprue STL';
  }
}
