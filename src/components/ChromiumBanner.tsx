import { browserName, CHROMIUM_PAD_CAP } from '../lib/browser';
import { CHROMIUM_AXIS_CAP, CHROMIUM_BUTTON_CAP } from '../lib/capture';
import { Ico } from './icons';

export const FIREFOX_DOWNLOAD = 'https://www.mozilla.org/firefox/download/';

/**
 * Firefox brand mark + link to the download page. Used on every Chromium limitation warning so the CTA is obvious
 * (the copy-link button stays where it already was).
 */
export function FirefoxCta({ className = '', size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  return (
    <a href={FIREFOX_DOWNLOAD} target="_blank" rel="noopener noreferrer" data-testid="firefox-download"
      title="Download Firefox" aria-label="Download Firefox (opens in a new tab)"
      className={`inline-flex shrink-0 items-center justify-center rounded-full transition hover:scale-105 hover:shadow-[0_0_14px_-2px_#ff7139] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff7139] ${dim} ${className}`}>
      <FirefoxLogo className="h-full w-full" />
    </a>
  );
}

/** Simplified Firefox logo (filled brand colours) */
function FirefoxLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" role="img">
      <circle cx="12" cy="12" r="12" fill="#20123A" />
      <circle cx="12.2" cy="12.4" r="6.2" fill="#0060DF" />
      <path fill="#FF7139" d="M4.2 14.8c.6-2.8 2.1-4.6 3.4-5.6-.2 1.1 0 2.3.6 3.3C6.8 9.6 9.2 6.2 13.4 5c-.5.1-1 .3-1.4.6 2.2-.6 4.5-.2 5.9 1.4 1.1 1.2 1.6 2.9 1.5 4.6-.1 2.6-1.5 5-3.7 6.4-2.4 1.5-5.6 1.6-8.1.2-1.7-1-2.9-2.6-3.4-4.5z" />
      <path fill="#FFA436" d="M7.6 9.4c1.3-1.8 3.5-2.9 5.8-2.9.4 0 .8 0 1.2.1-1.9.6-3.3 1.9-4.1 3.5-.5-.3-1.1-.5-1.7-.6-.4 0-.8 0-1.2-.1z" />
      <circle cx="13.2" cy="12.6" r="3.1" fill="#FFD567" />
      <circle cx="13.2" cy="12.6" r="1.7" fill="#20123A" />
    </svg>
  );
}

/** Warns that Chromium-based browsers only expose the first 4 controllers (and 32 buttons / 16 axes each) to web pages */
export function ChromiumBanner({ detected, compact }: { detected: number; compact?: boolean }) {
  const b = browserName();
  if (!b.chromium) return null;
  const full = detected >= CHROMIUM_PAD_CAP;
  return (
    <div data-testid="chromium-banner" className={`flex gap-3 rounded-lg border ${full ? 'border-alert/70 bg-alert/10' : 'border-mod/60 bg-mod/10'} ${compact ? 'items-center px-3 py-2 text-[11px]' : 'items-start px-4 py-3 text-xs'} leading-relaxed text-slate-200`}>
      <FirefoxCta size={compact ? 'sm' : 'md'} className="mt-0.5" />
      <div className="min-w-0 flex-1">
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
      <FirefoxCta size="md" />
      <span className="font-display text-sm font-bold uppercase tracking-widest text-alert"><Ico name="alert" className="mr-1" />{name} cannot see buttons above {CHROMIUM_BUTTON_CAP}</span>
      <span className="min-w-0 flex-1">
        {templateMax > CHROMIUM_BUTTON_CAP ? <>This device uses buttons up to <b>{templateMax}</b>. </> : <>{device} reports <b>{deviceButtons}</b> buttons. </>}
        In {name} (and every Chromium browser) buttons <b>{CHROMIUM_BUTTON_CAP + 1}+</b> never reach the page: they do not light up here and cannot be captured by pressing them
        (their bindings still show, and you can type them, e.g. js1_button40). <b>Open this page in Firefox</b> to see and capture every button.
      </span>
      <button type="button" onClick={copy} className="rounded border border-alert/60 px-2 py-1 text-[11px] font-semibold text-alert hover:bg-alert/20">Copy link for Firefox</button>
    </div>
  );
}
