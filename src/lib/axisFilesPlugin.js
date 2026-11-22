import { registerPlugin } from '@capacitor/core';

// The app's own Android file plugin (AxisFilesPlugin.java): saving exports and
// receiving files opened with AXIS. Registered once, shared by both.
export const AxisFiles = registerPlugin('AxisFiles');
