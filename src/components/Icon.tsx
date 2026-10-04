const P: Record<string, string> = {
  flight: 'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',
  combat: 'M12 2v5M12 17v5M2 12h5M17 12h5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  industry: 'M4 20l7-7M14 4l6 6-3 3-6-6zM9 9l6 6',
  turret: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 12l6-6M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  fps: 'M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 8v6M8 22l4-8 4 8M7 11h10',
  eva: 'M12 3a6 6 0 0 0-6 6v3a6 6 0 0 0 12 0V9a6 6 0 0 0-6-6zM8 9h8v3H8zM4 20h16',
  vehicle: 'M3 14l2-5h14l2 5v4H3zM7 18a2 2 0 1 0 0.1 0M17 18a2 2 0 1 0 0.1 0M6 9l1-3h10l1 3',
  social: 'M4 5h16v10H9l-5 4zM8 9h8M8 12h5',
  camera: 'M3 7h4l2-3h6l2 3h4v12H3zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  internal: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  unlisted: 'M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V15M12 18v.5',
};
export function Icon({ name, className = 'h-4 w-4' }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={P[name] ?? P.internal} />
    </svg>
  );
}
