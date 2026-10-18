import { useStaleBuild } from '../lib/staleBuild';

export function StaleBuildBanner() {
  const stale = useStaleBuild();
  if (!stale) return null;
  return <div role="alert" data-testid="stale-build-banner" className="mx-4 mt-3 shrink-0 rounded-lg border border-alert/60 bg-panel/95 px-4 py-3 text-xs text-slate-200">
    Device templates couldn't load. The site was updated —{' '}
    <button type="button" data-testid="stale-build-reload" onClick={() => location.reload()} className="rounded border border-alert/60 px-2 py-0.5 text-xs font-semibold text-alert hover:bg-alert/10">Reload</button>
  </div>;
}
