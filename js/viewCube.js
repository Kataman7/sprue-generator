import * as THREE from 'three';

export function setupViewCube(getCamera, controls) {
  const el = document.getElementById('viewCube');
  let isCameraAnimating = false;
  let cameraAnimId = null;

  const getCam = typeof getCamera === 'function' ? getCamera : () => getCamera;

  controls.addEventListener('start', () => {
    if (isCameraAnimating) {
      if (cameraAnimId) cancelAnimationFrame(cameraAnimId);
      cameraAnimId = null;
      isCameraAnimating = false;
    }
  });

  function updateViewCubeRotation() {
    const cam = getCam ? getCam() : null;
    if (!el || !cam || !cam.matrixWorldInverse || !cam.matrixWorldInverse.elements) return;
    try {
      if (typeof cam.updateMatrixWorld === 'function') {
        cam.updateMatrixWorld();
      }
      const m = cam.matrixWorldInverse.elements;
      if (!m || m.length < 16) return;
      // Three.js -> CSS 3D (diag(1, -1, 1))
      el.style.transform = `matrix3d(
        ${m[0].toFixed(6)}, ${(-m[1]).toFixed(6)}, ${m[2].toFixed(6)}, 0,
        ${(-m[4]).toFixed(6)}, ${m[5].toFixed(6)}, ${(-m[6]).toFixed(6)}, 0,
        ${m[8].toFixed(6)}, ${(-m[9]).toFixed(6)}, ${m[10].toFixed(6)}, 0,
        0, 0, 0, 1
      )`;
    } catch (e) {
      // gracefully ignore if matrix is momentarily invalid
    }
  }

  function setCameraView(viewName) {
    const cam = getCam ? getCam() : null;
    if (!cam || !controls || !controls.target) return;
    const target = controls.target.clone();
    const dist = Math.max(cam.position.distanceTo(target), 45);
    let toPos = new THREE.Vector3();
    const eps = Math.max(dist * 0.01, 0.4);

    switch (viewName) {
      case 'top':
        toPos.set(target.x, target.y + dist, target.z + eps);
        break;
      case 'bottom':
        toPos.set(target.x, target.y - dist, target.z + eps);
        break;
      case 'front':
        toPos.set(target.x, target.y, target.z + dist);
        break;
      case 'back':
        toPos.set(target.x, target.y, target.z - dist);
        break;
      case 'left':
        toPos.set(target.x - dist, target.y, target.z);
        break;
      case 'right':
        toPos.set(target.x + dist, target.y, target.z);
        break;
      case 'iso':
      default:
        const dIso = dist * 0.65;
        toPos.set(target.x + dIso, target.y + dIso * 1.1, target.z + dIso * 1.2);
        break;
    }
    animateCameraTo(toPos, target);
  }

  function animateCameraTo(toPos, toTarget) {
    if (cameraAnimId) {
      cancelAnimationFrame(cameraAnimId);
      cameraAnimId = null;
    }

    isCameraAnimating = true;
    const cam = getCam ? getCam() : null;
    if (!cam) {
      isCameraAnimating = false;
      return;
    }
    const fromPos = cam.position.clone();
    const startTime = performance.now();
    const duration = 280;

    const vFrom = fromPos.clone().sub(toTarget);
    const vTo = toPos.clone().sub(toTarget);
    const rFrom = vFrom.length();
    const rTo = vTo.length();
    if (rFrom < 0.0001 || rTo < 0.0001) {
      isCameraAnimating = false;
      return;
    }
    vFrom.normalize();
    vTo.normalize();

    let q = new THREE.Quaternion();
    const dot = Math.max(-1, Math.min(1, vFrom.dot(vTo)));
    if (dot < -0.9999) {
      let axis = new THREE.Vector3(0, 1, 0).cross(vFrom);
      if (axis.lengthSq() < 0.001) {
        axis = new THREE.Vector3(1, 0, 0).cross(vFrom);
      }
      axis.normalize();
      q.setFromAxisAngle(axis, Math.PI);
    } else {
      q.setFromUnitVectors(vFrom, vTo);
    }
    const qIdent = new THREE.Quaternion();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentQ = qIdent.clone().slerp(q, ease);
      const currentDir = vFrom.clone().applyQuaternion(currentQ);
      const currentRadius = THREE.MathUtils.lerp(rFrom, rTo, ease);

      const activeCam = getCam ? getCam() : null;
      if (!activeCam) return;
      activeCam.position.copy(toTarget).addScaledVector(currentDir, currentRadius);
      activeCam.up.set(0, 1, 0);
      activeCam.lookAt(toTarget);
      if (typeof activeCam.updateProjectionMatrix === 'function') {
        activeCam.updateProjectionMatrix();
      }

      if (controls && controls.target) {
        controls.target.copy(toTarget);
      }
      updateViewCubeRotation();

      if (progress < 1.0) {
        cameraAnimId = requestAnimationFrame(step);
      } else {
        cameraAnimId = null;
        isCameraAnimating = false;
        if (controls && controls.target) {
          controls.target.copy(toTarget);
          if (typeof controls.update === 'function') {
            controls.update();
          }
        }
        updateViewCubeRotation();
      }
    }
    cameraAnimId = requestAnimationFrame(step);
  }

  document.querySelectorAll('[data-view]').forEach(elem => {
    elem.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = elem.getAttribute('data-view');
      if (v) setCameraView(v);
    });
  });

  return {
    updateViewCubeRotation,
    isAnimating: () => isCameraAnimating
  };
}
