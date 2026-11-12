import { toast } from 'sonner';
import { localBoolean, lastSkipReason } from './booleanLocal';
import { closedTopologyProblem } from './booleanTopology';
import { mergeHiddenDiagonals } from './quadMerge';

// Boolean Subtract / Union / Intersect.
//
// There is one solver: `localBoolean`. It cuts only the faces that actually
// touch the other object and leaves the rest of the model exactly as it was —
// same vertices, same edge lines. If it cannot run, the tool says so and
// changes nothing, rather than silently falling back to a different method.

// Above this the solver would take long enough to freeze the app, so the tool
// declines instead of hanging.
const MAX_TRIANGLES = 30000;

// Runs the boolean on a copy of the base; the scene is not changed. Returns
// { ok: true, base, operands, work } or { ok: false, message, notTouching }.
function computeBoolean(manager, ids, operation) {
  const label = `${operation[0].toUpperCase()}${operation.slice(1)}`;
  const base = manager.getMesh(ids[0]);
  const operands = ids.slice(1).map((id) => manager.getMesh(id)).filter(Boolean);
  if (!base || operands.length === 0) return { ok: false, message: null };
  if (base.locked || operands.some((mesh) => mesh.locked)) {
    return { ok: false, message: 'Unlock the selected objects first.' };
  }

  const triangles = [base, ...operands].reduce((total, mesh) => total + mesh.getTriangleCount(), 0);
  if (triangles > MAX_TRIANGLES) {
    return { ok: false, message: 'These objects are too dense. Reduce their segments and try again.' };
  }

  // Only enforce a closed result when the supplied solids are already closed.
  // Open imported/user meshes retain the original local solver behaviour.
  const inputsAreClosed = !closedTopologyProblem(base) &&
    operands.every((mesh) => !closedTopologyProblem(mesh));
  // Work on a copy so the object is left alone unless every step succeeds.
  const work = base.clone();
  for (const operand of operands) {
    let done = false, why = 'an internal error';
    try {
      done = localBoolean(manager, work, operand, operation);
      why = lastSkipReason || why;
    } catch (error) {
      console.warn('Boolean failed', error);
      done = false;
    }
    if (!done) {
      return { ok: false, message: `${label} could not run: ${why}.`, notTouching: why === 'the objects are not touching' };
    }
    // Reject bad connectivity BEFORE committing or removing any operand.
    // A hidden wireframe edge is never a substitute for a shared mesh edge.
    if (inputsAreClosed && work.faces.length) {
      const issue = closedTopologyProblem(work);
      if (issue) {
        return { ok: false, message: `Boolean did not produce a connected solid: ${issue}. Original objects were kept.` };
      }
    }
    if (work.faces.length === 0) break;
  }

  if (work.faces.length === 0) {
    return {
      ok: false,
      message: operation === 'subtract'
        ? 'Nothing left after the subtraction — the cutter covers the whole object.'
        : 'The selected objects do not share any volume.',
    };
  }
  return { ok: true, base, operands, work };
}

// Puts a computed result into the scene: the base takes the result, the
// other objects are removed, and the change is one undo step.
function commitBoolean(manager, { base, operands, work }, snapshot) {
  manager.pushUndoSnapshot(snapshot);
  base.vertices = work.vertices;
  base.faces = work.faces;
  base.faceColors = work.faceColors;
  base.hiddenEdges = work.hiddenEdges;
  base.visibleEdges = work.visibleEdges;
  base.explicitEdges = work.explicitEdges;
  // Copy the updated wireframe source as well as the topology. A stale
  // paintWireEdges array overrides ALL rebuilt edges when rendering.
  base.paintWireEdges = work.paintWireEdges;
  base._paintDense = work._paintDense;
  base.primitiveType = work.primitiveType;
  base.segments = work.segments;
  base.invalidateCache();
  // Triangle pairs the Boolean left joined by a hidden diagonal become one face.
  mergeHiddenDiagonals(base);
  for (const mesh of operands) manager.removeMesh(mesh.id);
  manager.selectedMeshIds = [];
  manager.rebuildThreeMesh(base.id);
  manager.setSelection({ meshId: base.id, type: 'object', indices: [] });
  manager.updateStats();
}

// Returns true when the objects were combined, false when nothing changed.
function booleanSelection(manager, operation) {
  const ids = manager.selectedMeshIds.length >= 2 ? [...manager.selectedMeshIds] : [];
  if (ids.length < 2) {
    toast(`${operation[0].toUpperCase()}${operation.slice(1)} needs two objects. Select the object to keep first, then another object.`);
    return false;
  }
  const snapshot = manager.captureSnapshot();
  const result = computeBoolean(manager, ids, operation);
  if (!result.ok) {
    if (result.message) toast(result.message);
    return false;
  }
  commitBoolean(manager, result, snapshot);
  return true;
}

export const subtractSelection = (manager) => booleanSelection(manager, 'subtract');
export const unionSelection = (manager) => booleanSelection(manager, 'union');
export const intersectSelection = (manager) => booleanSelection(manager, 'intersect');

// Boolean panel: whether the assigned pair can be combined, without changing
// anything. { ok } or { ok: false, message, notTouching }.
export function checkBooleanPair(manager, baseId, otherId, operation) {
  const result = computeBoolean(manager, [baseId, otherId], operation);
  return result.ok ? { ok: true } : { ok: false, message: result.message, notTouching: !!result.notTouching };
}

// Boolean panel: combine the assigned pair. The base keeps the result.
export function applyBooleanPair(manager, baseId, otherId, operation) {
  const snapshot = manager.captureSnapshot();
  const result = computeBoolean(manager, [baseId, otherId], operation);
  if (!result.ok) {
    if (result.message) toast(result.message);
    return false;
  }
  commitBoolean(manager, result, snapshot);
  return true;
}
