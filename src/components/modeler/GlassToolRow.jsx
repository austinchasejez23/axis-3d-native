import React from 'react';

// One translucent surface per continuous run of tools, not one tile per
// button. Occupancy comes from the user's current arrangement, so moving,
// hiding or showing tools reshapes the glass without filling empty slots.
// Runs that continue into adjacent rows share square seams and read as one
// joined panel (including a vertical left-side stack).
export default function GlassToolRow({
  cells,
  backdropCells = cells.map(Boolean),
  previousCells = [],
  nextCells = [],
  className = '',
}) {
  const runs = [];
  for (let col = 0; col < cells.length;) {
    if (!backdropCells[col]) { col++; continue; }
    const start = col;
    while (col < cells.length && backdropCells[col]) col++;
    runs.push({ start, end: col });
  }

  return (
    <div className={`relative flex items-end ${className}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {runs.map(({ start, end }) => {
          const topLeft = previousCells[start] ? 0 : 8;
          const topRight = previousCells[end - 1] ? 0 : 8;
          const bottomRight = nextCells[end - 1] ? 0 : 8;
          const bottomLeft = nextCells[start] ? 0 : 8;
          return (
            <div
              key={start}
              className="absolute inset-y-0"
              style={{
                left: `${start * 100 / cells.length}%`,
                width: `${(end - start) * 100 / cells.length}%`,
                background: 'rgba(9,13,22,0.26)',
                borderRadius: `${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`,
              }}
            />
          );
        })}
      </div>
      {cells.map((cell, i) => cell ? (
        <div key={i} className="relative z-10 flex-1 min-w-0 pointer-events-auto">
          {cell}
        </div>
      ) : (
        <div key={i} className="relative z-10 flex-1" />
      ))}
    </div>
  );
}
