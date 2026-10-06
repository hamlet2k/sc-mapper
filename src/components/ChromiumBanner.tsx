import { browserName, CHROMIUM_PAD_CAP } from '../lib/browser';
import { CHROMIUM_AXIS_CAP, CHROMIUM_BUTTON_CAP } from '../lib/capture';
import { Ico } from './icons';

/** Warns that Chromium-based browsers only expose the first 4 controllers (and 32 buttons / 16 axes each) to web pages */
export function ChromiumBanner({ detected, compact }: { detected: number; compact?: boolean }) {
  const b = browserName();
  if (!b.chromium) return null;
  const full = detected >= CHROMIUM_PAD_CAP;
  return (
    <div data-testid="chromium-banner" className={`rounded-lg border ${full ? 'border-alert/70 bg-alert/10' : 'border-mod/60 bg-mod/10'} ${compact ? 'px-3 py-2 text-[11px]' : 'px-4 py-3 text-xs'} leading-relaxed text-slate-200`}>
      <div className={`font-display font-bold uppercase tracking-widest ${full ? 'text-alert' : 'text-mod'} ${compact ? 'text-xs' : 'text-sm'}`}>
        <Ico name="alert" className="mr-1" />{b.name.replace(/\s*\(.*\)$/, '').replace(/\s+\d+$/, '')} shows this page at most {CHROMIUM_PAD_CAP} controllers
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

/**
 * Devices view: a device (or the template picked for it) with more than 32 buttons in a Chromium browser. Those buttons are
 * invisible to the page there (no live highlight, no press-to-capture), although their bindings still show.
 */
export function ChromiumButtonNotice({ templateMax, deviceButtons, device }: { templateMax: number; deviceButtons?: number; device: string }) {
  const b = browserName();
  if (!b.chromium || (templateMax <= CHROMIUM_BUTTON_CAP && (deviceButtons ?? 0) < CHROMIUM_BUTTON_CAP)) return null;
  const name = b.name.replace(/\s*\(.*\)$/, '').replace(/\s+\d+$/, '');
  const copy = () => { void navigator.clipboard?.writeText(location.href).catch(() => {}); };
  return (
    <div data-testid="chromium-button-notice" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border-2 border-alert/80 bg-alert/15 px-4 py-2.5 text-xs leading-relaxed text-slate-100 print:hidden">
      <span className="font-display text-sm font-bold uppercase tracking-widest text-alert">  <Ico name="alert" className="mr-1" />{name} cannot see buttons above {CHROMIUM_BUTTON_CAP}</span>
      <span className="min-w-0 flex-1">
        {templateMax > CHROMIUM_BUTTON_CAP ? <>This device uses buttons up to <b>{templateMax}</b>. </> : <>{device} reports <b>{deviceButtons}</b> buttons. </>}
        In {name} (and every Chromium browser) buttons <b>{CHROMIUM_BUTTON_CAP + 1}+</b> never reach the page: they do not light up here and cannot be captured by pressing them
        (their bindings still show, and you can type them, e.g. js1_button40). <b>Open this page in Firefox</b> to see and capture every button.
      </span>
      <button type="button" onClick={copy} className="rounded border border-alert/60 px-2 py-1 text-[11px] font-semibold text-alert hover:bg-alert/20">Copy link for Firefox</button>
    </div>
  );
}
