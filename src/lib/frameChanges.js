// Collects the values something depends on, frame by frame, into reused
// arrays and reports whether any of them differs from the last frame: the
// same answer as building a signature string and comparing it, without
// building a string every frame.
export class FrameChanges {
  constructor() { this.prev = []; this.cur = []; this.valid = false; }
  begin() { this.cur.length = 0; }
  push(value) { this.cur.push(value); }
  pushArray(values) { this.cur.push(values.length); for (const v of values) this.cur.push(v); }
  // True when anything differs from the last call (or there was none).
  changed() {
    const a = this.prev, b = this.cur;
    let differs = !this.valid || a.length !== b.length;
    for (let i = 0; !differs && i < b.length; i++) {
      const x = a[i], y = b[i];
      if (x !== y && !(x !== x && y !== y)) differs = true;
    }
    this.prev = b; this.cur = a;
    this.valid = true;
    return differs;
  }
  reset() { this.valid = false; }
}
