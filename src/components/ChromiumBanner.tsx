import { browserName, CHROMIUM_PAD_CAP } from '../lib/browser';
import { CHROMIUM_AXIS_CAP, CHROMIUM_BUTTON_CAP } from '../lib/capture';

/** Warns that Chromium-based browsers only expose the first 4 controllers (and 32 buttons / 16 axes each) to web pages */
export function ChromiumBanner({ detected, compact }: { detected: number; compact?: boolean }) {
  const b = browserName();
  if (!b.chromium) return null;
  const full = detected >= CHROMIUM_PAD_CAP;
  return (
    <div data-testid="chromium-banner" className={`rounded-lg border ${full ? 'border-alert/70 bg-alert/10' : 'border-mod/60 bg-mod/10'} ${compact ? 'px-3 py-2 text-[11px]' : 'px-4 py-3 text-xs'} leading-relaxed text-slate-200`}>
      <div className={`font-display font-bold uppercase tracking-widest ${full ? 'text-alert' : 'text-mod'} ${compact ? 'text-xs' : 'text-sm'}`}>
        ⚠ {b.name.replace(/\s*\(.*\)$/, '').replace(/\s+\d+$/, '')} shows this page at most {CHROMIUM_PAD_CAP} controllers
      </div>
      <p className="mt-0.5">
        Chromium-based browsers (Chrome, Edge, Brave, Opera, Comet…) only expose the <b>first {CHROMIUM_PAD_CAP} game controllers</b> to web pages, and at most{' '}
        <b>{CHROMIUM_BUTTON_CAP} buttons / {CHROMIUM_AXIS_CAP} axes</b> on each. {full ? <>All {CHROMIUM_PAD_CAP} slots are in use, so <b>other connected devices are hidden</b>. </> : null}
        For more controllers or buttons above {CHROMIUM_BUTTON_CAP}, open this page in <b>Firefox</b>, which shows every device and all its buttons.
        {!compact && <> Your bindings and settings are stored per browser, so export from here and import in Firefox (or start there).</>}
      </p>
    </div>
  );
}
