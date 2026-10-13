import { useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';

const hueToHex = (hue) => `#${new THREE.Color().setHSL((hue % 360) / 360, 1, 0.5).getHexString()}`;
const savedColor = (value, fallbackHue) => (typeof value === 'string' ? value : hueToHex(value ?? fallbackHue));

// Multi (color-shift) paint state: a primary color, the shift color, and how
// strongly the shift color takes over at glancing angles.
export default function useChameleon(meshId, managerRef) {
  const [primary, setPrimary] = useState('#ff0000');
  const [secondary, setSecondary] = useState('#00aaff');
  const [intensity, setIntensity] = useState(0);

  useEffect(() => {
    const mesh = managerRef.current?.getMesh(meshId);
    if (!mesh) return;
    setPrimary(savedColor(mesh.chamPrimary, 0));
    setSecondary(savedColor(mesh.chamSecondary, 200));
    setIntensity(Math.round((mesh.chamIntensity ?? 0) * 100));
  }, [meshId, managerRef]);

  const apply = useCallback((p, s, i) => managerRef.current?.setMaterialChameleon(p, s, i / 100), [managerRef]);

  const setColor = useCallback((target, color) => {
    const p = target === 'primary' ? color : primary;
    const s = target === 'shift' ? color : secondary;
    setPrimary(p); setSecondary(s); apply(p, s, intensity);
  }, [primary, secondary, intensity, apply]);

  const setShift = useCallback((v) => { setIntensity(v); apply(primary, secondary, v); }, [primary, secondary, apply]);
  const applyNow = useCallback(() => apply(primary, secondary, intensity), [primary, secondary, intensity, apply]);

  return { primary, shiftColor: secondary, intensity, setColor, setShift, applyNow };
}