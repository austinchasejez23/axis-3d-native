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

function booleanSelection(manager, operation) {
  const ids = manager.selectedMeshIds.length >= 2 ? [...manager.selectedMeshIds] : [];
  if (ids.length < 2) {
    toast(`${operation[0].toUpperCase()}${operation.slice(1)} needs two objects. Select the object to keep first, then another object.`);
    return;
  }

  const base = manager.getMesh(ids[0]);
  const operands = ids.slice(1).map((id) => manager.getMesh(id)).filter(Boolean);
  if (!base || operands.length === 0) return;
  if (base.locked || operands.some((mesh) => mesh.locked)) {
    toast('Unlock the selected objects first.');
    return;
  }

  const triangles = [base, ...operands].reduce((total, mesh) => total + mesh.getTriangleCount(), 0);
  if (triangles > MAX_TRIANGLES) {
    toast('These objects are too dense. Reduce their segments and try again.');
    return;
  }

  const snapshot = manager.captureSnapshot();
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
      toast(`${operation[0].toUpperCase()}${operation.slice(1)} could not run: ${why}.`);
      return;
    }
    // Reject bad connectivity BEFORE committing or removing any operand.
    // A hidden wireframe edge is never a substitute for a shared mesh edge.
    if (inputsAreClosed && work.faces.length) {
      const issue = closedTopologyProblem(work);
      if (issue) {
        toast(`Boolean did not produce a connected solid: ${issue}. Original objects were kept.`);
        return;
      }
    }
    if (work.faces.length === 0) break;
  }

  if (work.faces.length === 0) {
    toast(operation === 'subtract'
      ? 'Nothing left after the subtraction — the cutter covers the whole object.'
      : 'The selected objects do not share any volume.');
    return;
  }

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

export const subtractSelection = (manager) => booleanSelection(manager, 'subtract');
export const unionSelection = (manager) => booleanSelection(manager, 'union');
export const intersectSelection = (manager) => booleanSelection(manager, 'intersect');
