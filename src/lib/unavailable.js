// A control that can't act right now says why instead of doing nothing: the
// reason shows as a prompt under the HUD (the modeler listens for this event).
export const UNAVAILABLE_EVENT = 'axis-unavailable';

export function notifyUnavailable(text) {
  if (!text || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(UNAVAILABLE_EVENT, { detail: { text } }));
}

// Props for a button that is greyed out while `blocked`. It uses aria-disabled
// instead of disabled, because a disabled button swallows the tap and could
// not say why it does nothing. Style it with `aria-disabled:` classes.
export function blockedButton(blocked, reason, onClick) {
  return {
    'aria-disabled': blocked || undefined,
    onClick: (event) => {
      if (blocked) notifyUnavailable(reason);
      else onClick?.(event);
    },
  };
}
