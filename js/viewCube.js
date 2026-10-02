import * as THREE from 'three';

export function setupViewCube(camera, controls) {
  const el = document.getElementById('viewCube');
  let isCameraAnimating = false;
  let cameraAnimId = null;

  controls.addEventListener('start', () => {
    if (isCameraAnimating) {
      if (cameraAnimId) cancelAnimationFrame(cameraAnimId);
      cameraAnimId = null;
      isCameraAnimating = false;
    }
  });

  function updateViewCubeRotation() {
    if (!el || !camera) return;
    const m = camera.matrixWorldInverse.elements;
    // Three.js -> CSS 3D (diag(1, -1, 1))
    el.style.transform = `matrix3d(
      ${m[0].toFixed(6)}, ${(-m[1]).toFixed(6)}, ${m[2].toFixed(6)}, 0,
      ${(-m[4]).toFixed(6)}, ${m[5].toFixed(6)}, ${(-m[6]).toFixed(6)}, 0,
      ${m[8].toFixed(6)}, ${(-m[9]).toFixed(6)}, ${m[10].toFixed(6)}, 0,
      0, 0, 0, 1
    )`;
  }

  function setCameraView(viewName) {
    const target = controls.target.clone();
    const dist = Math.max(camera.position.distanceTo(target), 45);
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
    const fromPos = camera.position.clone();
    const startTime = performance.now();
    const duration = 300;

    const vFrom = fromPos.clone().sub(toTarget);
    const vTo = toPos.clone().sub(toTarget);
    const rFrom = vFrom.length();
    const rTo = vTo.length();
    vFrom.normalize();
    vTo.normalize();

    const q = new THREE.Quaternion().setFromUnitVectors(vFrom, vTo);
    const qIdent = new THREE.Quaternion();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentQ = qIdent.clone().slerp(q, ease);
      const currentDir = vFrom.clone().applyQuaternion(currentQ);
      const currentRadius = THREE.MathUtils.lerp(rFrom, rTo, ease);

      camera.position.copy(toTarget).addScaledVector(currentDir, currentRadius);
      camera.up.set(0, 1, 0);
      camera.lookAt(toTarget);

      if (progress < 1.0) {
        cameraAnimId = requestAnimationFrame(step);
      } else {
        cameraAnimId = null;
        isCameraAnimating = false;
        controls.target.copy(toTarget);
        controls.update();
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
