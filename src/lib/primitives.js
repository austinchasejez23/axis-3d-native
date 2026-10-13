import * as THREE from 'three';
import { EditableMesh } from './EditableMesh';

function buildHelixGeometry({ turns = 1, innerDiameter = 0.5, thickness = 0.25, height = 0.5, segmentsPerTurn = 12, sides = 6 } = {}) {
  turns = Math.max(0.05, Number(turns) || 1);
  thickness = Math.max(0.02, Number(thickness) || 0.25);
  height = Math.max(0, Number(height) || 0);
  sides = Math.max(3, Math.round(sides));
  const pathSegments = Math.max(3, Math.round(segmentsPerTurn * turns));
  const radius = Math.max(0, Number(innerDiameter) || 0) / 2 + thickness / 2;
  const profileRadius = thickness / 2;
  const totalAngle = Math.PI * 2 * turns;
  const risePerRadian = totalAngle > 1e-9 ? height / totalAngle : 0;

  const positions = [];
  const indices = [];
  for (let i = 0; i <= pathSegments; i++) {
    const t = i / pathSegments;
    const a = totalAngle * t;
    const ca = Math.cos(a), sa = Math.sin(a);
    const cx = ca * radius, cy = (t - 0.5) * height, cz = sa * radius;

    // Stable local frame: R always points away from the helix axis. B is
    // perpendicular to both the path tangent and R. Unlike TubeGeometry's
    // transported Frenet frame, this cannot roll around the path, so low-sided
    // profiles remain consistently oriented and a triangle behaves like thread.
    const rx = ca, ry = 0, rz = sa;
    let bx = risePerRadian * sa;
    let by = radius;
    let bz = -risePerRadian * ca;
    const bl = Math.hypot(bx, by, bz) || 1;
    bx /= bl; by /= bl; bz /= bl;

    for (let j = 0; j < sides; j++) {
      // For three sides, j=0 is the outward crest and the opposite edge faces
      // the helix axis. Higher side counts retain the same stable orientation.
      const p = Math.PI * 2 * j / sides;
      const cp = Math.cos(p) * profileRadius;
      const sp = Math.sin(p) * profileRadius;
      positions.push(cx + rx * cp + bx * sp, cy + ry * cp + by * sp, cz + rz * cp + bz * sp);
    }
  }

  for (let i = 0; i < pathSegments; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + (j + 1) % sides;
      const c = (i + 1) * sides + (j + 1) % sides;
      const d = (i + 1) * sides + j;
      indices.push(a, b, d, b, c, d);
    }
  }
  // Cap both open ends.
  const startCenter = positions.length / 3;
  positions.push(radius, -height / 2, 0);
  const endCenter = positions.length / 3;
  positions.push(Math.cos(totalAngle) * radius, height / 2, Math.sin(totalAngle) * radius);
  for (let j = 0; j < sides; j++) {
    const n = (j + 1) % sides;
    indices.push(startCenter, n, j);
    const base = pathSegments * sides;
    indices.push(endCenter, base + j, base + n);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Round shapes need at least 3 segments around (X) and, for sphere/torus/helix,
// at least 3 along their second direction (Y); buildGeometry enforces the same.
const RADIAL_X_TYPES = new Set(['sphere', 'cylinder', 'cone', 'tube', 'torus', 'helix']);
const RADIAL_Y_TYPES = new Set(['sphere', 'torus', 'helix']);
export const isRadialPrimitive = (type) => RADIAL_X_TYPES.has(type);
export function segmentMinimum(type, axis) {
  if (axis === 'x' && RADIAL_X_TYPES.has(type)) return 3;
  if (axis === 'y' && RADIAL_Y_TYPES.has(type)) return 3;
  return 1;
}

function buildGeometry(type, segX, segY, segZ, params = {}) {
  const sx = Math.max(1, Math.round(segX));
  const sy = Math.max(1, Math.round(segY));
  const sz = Math.max(1, Math.round(segZ));
  const rx = Math.max(3, sx);
  const ry = Math.max(3, sy);
  switch (type) {
    case 'cube': return new THREE.BoxGeometry(1, 1, 1, sx, sy, sz);
    case 'plane': return new THREE.PlaneGeometry(1, 1, sx, sy);
    case 'sphere': return new THREE.SphereGeometry(0.5, rx, ry);
    case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, rx, sy);
    case 'cone': return new THREE.ConeGeometry(0.5, 1, rx, sy);
    case 'pyramid': return new THREE.ConeGeometry(0.5, 1, 4);
    case 'tube': return new THREE.CylinderGeometry(0.5, 0.5, 1, rx, 1, true);
    case 'torus': {
      const tubeRadius = 0.15;
      const innerDiameter = Math.max(0.02, Number(params.innerDiameter) || 0.5);
      return new THREE.TorusGeometry(innerDiameter / 2 + tubeRadius, tubeRadius, ry, rx);
    }
    case 'helix': {
      const turns = Math.max(0.05, Number(params.turns) || 1);
      const thickness = Math.max(0.02, Number(params.thickness) || 0.25);
      return buildHelixGeometry({
        turns,
        innerDiameter: params.innerDiameter ?? 0.5,
        thickness,
        height: params.height ?? 0.5,
        segmentsPerTurn: rx,
        sides: ry,
      });
    }
    default: return new THREE.BoxGeometry(1, 1, 1, sx, sy, sz);
  }
}

export function createPrimitiveSegments(type, segX, segY, segZ, params = {}) {
  const geometry = buildGeometry(type, segX, segY, segZ, params);
  const mesh = EditableMesh.fromGeometry(geometry, type.charAt(0).toUpperCase() + type.slice(1));
  mesh.resetSurfaceAppearance();
  if (type === 'helix') {
    // Each swept profile quad is represented by two triangles. The helix
    // twists these quads, so geometric coplanarity tests incorrectly show
    // their internal diagonals as actual modeling edges.
    const pathQuads = Math.max(3, Math.round(Math.max(3, Math.round(segX)) * Math.max(0.05, Number(params.turns) || 1))) * Math.max(3, Math.round(Math.max(3, Math.round(segY))));
    for (let q = 0; q < pathQuads; q++) {
      const first = mesh.faces[q * 2];
      const second = mesh.faces[q * 2 + 1];
      if (!first || !second) break;
      const shared = first.filter(id => second.includes(id));
      if (shared.length === 2) mesh.hiddenEdges.push({ v1: shared[0], v2: shared[1], locked: true });
    }
  }
  mesh.primitiveType = type;
  mesh.segments = { x: segX, y: segY, z: segZ };
  mesh.primitiveParams = type === 'helix'
    ? { turns: params.turns ?? 1, innerDiameter: params.innerDiameter ?? 0.5, height: params.height ?? 0.5, thickness: params.thickness ?? 0.25 }
    : type === 'torus' ? { innerDiameter: params.innerDiameter ?? 0.5 } : null;
  geometry.dispose();
  return mesh;
}

export function createPrimitive(type, segments = 12) {
  const s = Math.max(3, segments);
  let segX = 1, segY = 1, segZ = 1;
  switch (type) {
    case 'cube': case 'plane': case 'pyramid': break;
    case 'sphere': segX = s; segY = Math.max(3, Math.floor(s / 2)); break;
    case 'cylinder': case 'cone': case 'tube': segX = s; break;
    case 'torus': case 'helix': segX = s; segY = Math.max(6, Math.floor(s / 2)); break;
    default: break;
  }
  return createPrimitiveSegments(type, segX, segY, segZ);
}

export const PRIMITIVE_TYPES = [
  { type: 'cube', label: 'Cube' },
  { type: 'plane', label: 'Plane' },
  { type: 'sphere', label: 'Sphere' },
  { type: 'cylinder', label: 'Cylinder' },
  { type: 'cone', label: 'Cone' },
  { type: 'pyramid', label: 'Pyramid' },
  { type: 'tube', label: 'Tube' },
  { type: 'torus', label: 'Torus' },
  { type: 'helix', label: 'Helix' },
];