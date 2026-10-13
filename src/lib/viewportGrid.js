import * as THREE from 'three';
import { makeFatSegments } from '@/lib/fatLines';

export function buildViewportGrid(size, square, color, renderer, backgroundColor) {
  const count = Math.min(250, Math.max(1, Math.round((size / 2) / square)));
  const half = count * square;
  const gridColor = new THREE.Color(color);
  const minorPositions = [];

  for (let i = 1; i <= count; i++) {
    for (const p of [i * square, -i * square]) {
      minorPositions.push(
        -half, 0, p, 0, 0, p,
        0, 0, p, half, 0, p,
        p, 0, -half, p, 0, 0,
        p, 0, 0, p, 0, half,
      );
    }
  }

  const minorGeometry = new THREE.BufferGeometry();
  minorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(minorPositions, 3));
  minorGeometry.setAttribute('color', new THREE.Float32BufferAttribute(
    new Array(minorPositions.length).fill(0), 3
  ));
  const minorMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    toneMapped: false,
  });
  const minorLines = new THREE.LineSegments(minorGeometry, minorMaterial);

  const grid = new THREE.Group();
  grid.add(minorLines);
  const axisSegments = [];
  const axisBands = 8;
  const bandLength = half / axisBands;
  for (let i = 0; i < axisBands; i++) {
    const a = i * bandLength;
    const b = (i + 1) * bandLength;
    for (const [x1, z1, x2, z2] of [
      [a, 0, b, 0], [-a, 0, -b, 0], [0, a, 0, b], [0, -a, 0, -b],
    ]) {
      const axis = makeFatSegments([x1, 0, z1, x2, 0, z2], gridColor, 2, renderer);
      grid.add(axis);
      axisSegments.push({ axis, x: (x1 + x2) / 2, z: (z1 + z2) / 2 });
    }
  }

  grid.userData.viewportGrid = {
    minorLines,
    axisSegments,
    gridColor,
    background: new THREE.Color(backgroundColor),
  };
  return grid;
}

export function updateViewportGridFade(grid, camera, cameraDistance, backgroundColor) {
  const data = grid?.userData?.viewportGrid;
  if (!data || !camera) return;
  data.background.set(backgroundColor);
  const start = Math.max(2, cameraDistance * 0.7);
  const end = Math.max(start + 1, cameraDistance * 3);
  const fadeAt = (x, z) => 1 - THREE.MathUtils.smoothstep(
    Math.hypot(x - camera.position.x, z - camera.position.z), start, end
  );
  const colorAt = (x, z, strength) => data.background.clone().lerp(data.gridColor, fadeAt(x, z) * strength);

  const positions = data.minorLines.geometry.getAttribute('position');
  const colors = data.minorLines.geometry.getAttribute('color');
  for (let i = 0; i < positions.count; i++) {
    const color = colorAt(positions.getX(i), positions.getZ(i), 0.65);
    colors.setXYZ(i, color.r, color.g, color.b);
  }
  colors.needsUpdate = true;

  for (const { axis, x, z } of data.axisSegments) {
    axis.material.color.copy(colorAt(x, z, 0.95));
  }
}

export function disposeViewportGrid(grid) {
  grid?.traverse((child) => {
    child.geometry?.dispose();
    child.material?.dispose();
  });
}

export function updateViewportGridResolution(grid, width, height) {
  grid?.traverse((child) => child.material?.resolution?.set(width, height));
}