import * as THREE from 'three';

const wireMaterial = (color) => new THREE.LineBasicMaterial({
  color,
  transparent: true,
  opacity: 0.78,
  depthTest: false,
  toneMapped: false,
});

function addWire(group, object) {
  object.userData.lightTint = true;
  object.renderOrder = 1001;
  group.add(object);

  const outline = object.clone();
  outline.material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    depthTest: false,
    transparent: true,
    opacity: 1,
    toneMapped: false,
  });
  outline.scale.setScalar(1.08);
  outline.userData.selectionOutline = true;
  outline.visible = false;
  outline.renderOrder = 1002;
  group.add(outline);
}

function line(points, color) {
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point))),
    wireMaterial(color),
  );
}

function loop(points, color) {
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point))),
    wireMaterial(color),
  );
}

function circlePoints(radius, axis = 'z', z = 0) {
  return Array.from({ length: 32 }, (_, index) => {
    const angle = index / 32 * Math.PI * 2;
    if (axis === 'x') return [0, Math.cos(angle) * radius, Math.sin(angle) * radius];
    if (axis === 'y') return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, z];
  });
}

function makeSpot(group, color) {
  const base = circlePoints(0.52, 'z', -1.15);
  addWire(group, loop(base, color));
  addWire(group, line([
    [0, 0, 0], base[0], [0, 0, 0], base[8],
    [0, 0, 0], base[16], [0, 0, 0], base[24],
    [0, 0, 0], [0, 0, -1.75],
  ], color));
}

function makePoint(group, color) {
  addWire(group, loop(circlePoints(0.38, 'x'), color));
  addWire(group, loop(circlePoints(0.38, 'y'), color));
  addWire(group, loop(circlePoints(0.38, 'z'), color));
  const rays = [];
  for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    for (const sign of [-1, 1]) {
      rays.push(axis.map((value) => value * sign * 0.48), axis.map((value) => value * sign * 0.72));
    }
  }
  addWire(group, line(rays, color));
}

function makeDirectional(group, color) {
  addWire(group, loop(circlePoints(0.32), color));
  const rays = [];
  for (let index = 0; index < 8; index++) {
    const angle = index / 8 * Math.PI * 2;
    rays.push(
      [Math.cos(angle) * 0.43, Math.sin(angle) * 0.43, 0],
      [Math.cos(angle) * 0.67, Math.sin(angle) * 0.67, 0],
    );
  }
  addWire(group, line(rays, color));
  addWire(group, line([
    [0, 0, -0.08], [0, 0, -1.25],
    [0, 0, -1.25], [0.18, 0, -1.02],
    [0, 0, -1.25], [-0.18, 0, -1.02],
    [0, 0, -1.25], [0, 0.18, -1.02],
    [0, 0, -1.25], [0, -0.18, -1.02],
  ], color));
}

export default function makeLightGizmo(data) {
  const group = new THREE.Group();
  if (data.type === 'spot') makeSpot(group, data.color);
  else if (data.type === 'point') makePoint(group, data.color);
  else makeDirectional(group, data.color);
  group.traverse((child) => { child.userData.lightId = data.id; });
  return group;
}