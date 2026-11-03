// The information button flashes now and then during a new user's first
// sessions. A session is one app launch. Imported first in main.jsx so it can
// tell a brand-new install from an existing user before theme.js writes its
// own storage on load.
const KEY = 'axis3d.helpHint.v1';
const SESSIONS = 10;
const EXISTING_USER_KEY = 'gestura_wireframe_default_v3';

let active = false;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  const state = saved && Number.isFinite(saved.sessions)
    ? saved
    : { sessions: 0, newUser: !localStorage.getItem(EXISTING_USER_KEY) };
  state.sessions += 1;
  localStorage.setItem(KEY, JSON.stringify(state));
  active = !!state.newUser && state.sessions <= SESSIONS;
} catch {
  active = false;
}

export const helpHintActive = () => active;

// Once the user opens Help, the flashing stops for the rest of the session.
export const stopHelpHint = () => { active = false; };
