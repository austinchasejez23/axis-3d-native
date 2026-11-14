// Icon of the Orthographic view button (top of the screen, and in Help): a
// cube whose receding edges stay parallel, as they do in an orthographic view.
export default function OrthographicIcon({ className = '', strokeWidth = 2, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 8h13v13H3z" />
      <path d="M3 8l5-5h13v13l-5 5" />
      <path d="M16 8l5-5" />
    </svg>
  );
}
