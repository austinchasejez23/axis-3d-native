export default function ResistanceIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M57 5 A45 45 0 1 1 49 95" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      <path d="M42 5 A45 45 0 0 0 33 8 M19 17 A45 45 0 0 0 14 24 M6 39 A45 45 0 0 0 5 47 M7 65 A45 45 0 0 0 12 73 M23 87 A45 45 0 0 0 31 92" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      <path d="M50 24 V76 M24 50 H76" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" />
      <path d="M50 13 L38 26 H62 Z M50 87 L38 74 H62 Z M13 50 L26 38 V62 Z M87 50 L74 38 V62 Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
