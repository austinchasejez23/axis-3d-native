import * as THREE from 'three';
import { theme } from '@/lib/theme';
import { makeFatSegments } from '@/lib/fatLines';

export function disposeDrawFaceGrid(manager) {
  const grid = manager.drawFaceGrid;
  if (!grid) return;
  manager.scene.remove(grid);
  grid.geometry.dispose();
  (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach((material) => material.dispose());
  manager.drawFaceGrid = null;
}

export default function updateDrawFaceGrid(manager) {
  if (manager.drawMode !== 'face' || !manager.drawGridEnabled) {
    disposeDrawFaceGrid(manager);
    return;
  }
  // Drawing uses quarter-inch squares independently of the viewport grid setting.
  const square = 0.25;
  const divisions = Math.min(500, Math.max(2, Math.round(theme.gridSize / square)));
  const config = `${square}:${divisions}:${theme.gridColor}`;
  if (manager.drawFaceGrid?.userData.config !== config) {
    disposeDrawFaceGrid(manager);
    const positions = [], half = Math.floor(divisions / 2) * square;
    for (let i = -Math.floor(divisions / 2); i <= Math.floor(divisions / 2); i++) {
      const v = i * square;
      positions.push(-half, 0, v, 0, 0, v, 0, 0, v, half, 0, v, v, 0, -half, v, 0, 0, v, 0, 0, v, 0, half);
    }
    const grid = makeFatSegments(positions, theme.gridColor, 1, manager.renderer);
    grid.name = 'Draw face axis grid';
    grid.userData.config = config;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    grid.material.depthWrite = false;
    grid.material.toneMapped = false;
    manager.drawFaceGrid = grid;
    manager.scene.add(grid);
  }
  manager.drawFaceGrid.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), manager.drawPlaneNormal);
  manager.drawFaceGrid.position.copy(manager.cameraTarget);
  manager.renderer.getSize(manager.drawFaceGrid.material.resolution);
}