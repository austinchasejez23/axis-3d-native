export function BevelRadiusIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20V12a8 8 0 0 1 8-8h8" />
    <circle cx="4" cy="20" r="1" fill="currentColor" />
    <path d="M4 20 9.7 14.3m-2.6.2 2.6-.2-.2 2.6" />
  </svg>;
}

export function BevelSegmentsIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 20h3m2.2-1.2 2.1-1.8m1.8-2.2 1.6-2.3m1.1-2.7.8-2.8M16 4h5" />
    <path d="M3 20a13 13 0 0 0 13-13V4" strokeOpacity=".5" />
  </svg>;
}