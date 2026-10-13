// Scene-unit <-> real-world unit conversion.
// Convention: 1 scene unit = 2 inches (= 50.8 mm).
// A default 1-unit cube therefore measures 2 inches per edge.
export function formatLength(worldUnits, unit = 'mm') {
  if (unit === 'in') return `${(worldUnits * 2).toFixed(2)} in`;
  return `${(worldUnits * 50.8).toFixed(1)} mm`;
}

export function toDisplayUnit(sceneValue, unit = 'mm') {
  return unit === 'in' ? sceneValue * 2 : sceneValue * 50.8;
}

export function fromDisplayUnit(displayValue, unit = 'mm') {
  return unit === 'in' ? displayValue / 2 : displayValue / 50.8;
}

// Transform values (HUD and value rows): three decimals, never "-0.000".
export function formatValue3(value) {
  const rounded = Math.round(Number(value) * 1000) / 1000;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(3);
}
