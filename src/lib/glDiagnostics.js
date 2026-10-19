// Collects the specific reasons WebGL can fail to start on a given device, so a
// blank viewport can be traced to real hardware/driver info instead of guessed at.
export function collectGlDiagnostics(error) {
  const lines = [];
  const add = (label, value) => lines.push({ label, value: String(value) });

  if (error) add('Error', error.message || error);

  const canvas = document.createElement('canvas');
  /** @type {WebGLRenderingContext | WebGL2RenderingContext | null} */
  let gl = null;
  let contextError = null;
  // A failed context creation fires this event with the driver's own reason.
  canvas.addEventListener('webglcontextcreationerror', (e) => {
    const contextEvent = /** @type {WebGLContextEvent} */ (e);
    contextError = contextEvent.statusMessage || 'unknown';
  });

  for (const type of ['webgl2', 'webgl', 'experimental-webgl']) {
    try {
      const context = canvas.getContext(type, { failIfMajorPerformanceCaveat: false });
      // getContext can return 2D or bitmap renderers, but WebGL diagnostics
      // are only valid for contexts with the WebGL extension API.
      if (context && 'getExtension' in context) {
        gl = /** @type {WebGLRenderingContext | WebGL2RenderingContext} */ (context);
      }
    } catch (e) {
      contextError = contextError || e.message;
    }
    if (gl) { add('Context', type); break; }
  }

  if (!gl) {
    add('Context', 'unavailable — WebGL could not be created');
    if (contextError) add('Driver reason', contextError);
  } else {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      add('GPU', gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
      add('GPU vendor', gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL));
    }
    add('GL version', gl.getParameter(gl.VERSION));
    add('Max texture size', gl.getParameter(gl.MAX_TEXTURE_SIZE));
    add('Float textures', gl.getExtension('OES_texture_float') ? 'yes' : 'no');
    if (contextError) add('Driver warning', contextError);
  }

  add('Device pixel ratio', window.devicePixelRatio);
  add('Screen', `${window.innerWidth}×${window.innerHeight}`);
  add('Browser', navigator.userAgent);

  return lines;
}

export function diagnosticsToText(lines) {
  return lines.map((l) => `${l.label}: ${l.value}`).join('\n');
}