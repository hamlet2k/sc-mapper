import { useEffect, useRef } from 'react';

// Escape closes only the topmost open layer (a dialog inside a modal closes before the modal itself).
const stack: { current: () => void }[] = [];
let installed = false;
function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !stack.length) return;
    e.preventDefault();
    stack[stack.length - 1].current();
  });
}

/** While `active`, Escape calls `onEscape` (when this is the most recently opened layer) */
export function useEscape(onEscape: () => void, active = true) {
  const ref = useRef(onEscape);
  useEffect(() => { ref.current = onEscape; }, [onEscape]);
  useEffect(() => {
    if (!active) return;
    install();
    const entry = { current: () => ref.current() };
    stack.push(entry);
    return () => { const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1); };
  }, [active]);
}
