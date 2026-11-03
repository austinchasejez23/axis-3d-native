// The top-of-screen tip. It points to the information button, which explains
// every tool. "{icon}" is replaced by the real information icon when shown.

const INFO_TIP = 'Tap information {icon} for tool description and help';

export function pickTip() {
  return INFO_TIP;
}
