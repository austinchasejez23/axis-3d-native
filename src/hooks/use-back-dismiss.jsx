import { useEffect, useRef } from 'react';

// Android back / browser back closes ONE open layer at a time instead of
// leaving the modeler. While any panel is open we hold one extra history
// entry; popping it (back gesture) runs `closeOne`. If it consumed a layer,
// the entry is re-pushed so the NEXT back press closes the next layer; once
// nothing is left open the spare entry is consumed automatically.
export default function useBackDismiss(active, closeOne) {
  const pushedRef = useRef(false);
  const closeRef = useRef(closeOne);
  closeRef.current = closeOne;

  useEffect(() => {
    const onPop = () => {
      if (pushedRef.current) {
        pushedRef.current = false;
        if (closeRef.current?.()) {
          pushedRef.current = true;
          window.history.pushState({ panel: true }, '');
        }
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (active && !pushedRef.current) {
      pushedRef.current = true;
      window.history.pushState({ panel: true }, '');
    } else if (!active && pushedRef.current) {
      pushedRef.current = false;
      // Only consume our own dummy entry. If the app navigated somewhere else
      // (e.g. to the library) the current entry is no longer the panel entry —
      // going back there would bounce the user off the new page.
      if (window.history.state?.panel) window.history.back();
    }
  }, [active]);
}