import * as THREE from 'three';

// World-space guide, independent of the small screen-sized light icon.
export function makeLightRangeGuide() {
  const material = new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, dashSize: 0.18, gapSize: 0.12, depthTest: true, depthWrite: false, toneMapped: false });
  const guide = new THREE.LineSegments(new THREE.BufferGeometry(), material);
  guide.renderOrder = 3;
  return guide;
}

export function updateLightRangeGuide(guide, light, selected, editing, highlight) {
  guide.visible = !!editing && !!selected;
  if (!guide.visible) return;
  const points = [];
  const segment = (a, b) => points.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
  const ring = (radius, axis, depth = 0) => {
    for (let i = 0; i < 48; i++) {
      const theta = i * Math.PI / 24, next = (i + 1) * Math.PI / 24;
      const pos = (angle) => axis === 'x' ? [depth, radius * Math.cos(angle), radius * Math.sin(angle)]
        : axis === 'y' ? [radius * Math.cos(angle), depth, radius * Math.sin(angle)]
        : [radius * Math.cos(angle), radius * Math.sin(angle), depth];
      segment(pos(theta), pos(next));
    }
  };
  if (light.type === 'point') {
    ring(light.range, 'x'); ring(light.range, 'y'); ring(light.range, 'z');
    ring(light.radius, 'x'); ring(light.radius, 'y'); ring(light.radius, 'z');
  } else if (light.type === 'spot') {
    const r = Math.tan(THREE.MathUtils.degToRad(Math.min(light.radius, 85))) * light.range;
    ring(r, 'z', -light.range);
    const near = Math.min(light.range, 2.5);
    ring(Math.tan(THREE.MathUtils.degToRad(Math.min(light.radius, 85))) * near, 'z', -near);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      segment([0, 0, 0], [r * Math.cos(angle), r * Math.sin(angle), -light.range]);
    }
  } else {
    // Parallel rays communicate direction, never a finite square light volume.
    const length = Math.min(3, Math.max(1, light.range * 0.2));
    for (const [x, y] of [[0, 0], [-0.45, 0], [0.45, 0], [0, -0.45], [0, 0.45]]) {
      segment([x, y, 0], [x, y, -length]);
      segment([x, y, -length], [x - 0.12, y, -length + 0.22]);
      segment([x, y, -length], [x + 0.12, y, -length + 0.22]);
    }
  }
  guide.geometry.dispose();
  guide.geometry = new THREE.BufferGeometry().setFromPoints(points);
  guide.computeLineDistances();
  guide.position.fromArray(light.position);
  guide.rotation.set(...light.rotation);
  guide.material.color.set(highlight);
}