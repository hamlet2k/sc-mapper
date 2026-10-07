// Support / source / feedback links in the title row. Plain links (no Ko-fi widget script, no tracking), opened in a new
// tab. Icon + short label on wide screens; icon-only below lg, where the aria-label and the Tip bubble carry the name.
import { Ico, type IconName } from './icons';
import { Tip } from './Tooltip';

export const SUPPORT_URL = 'https://ko-fi.com/hamlet2k';
export const REPO_URL = 'https://github.com/hamlet2k/sc-mapper';
export const FEEDBACK_URL = 'https://github.com/hamlet2k/sc-mapper/issues/new';

type LinkDef = { id: string; href: string; icon: IconName; label?: string; tip: string; accent?: boolean };
const LINKS: LinkDef[] = [
  { id: 'feedback', href: FEEDBACK_URL, icon: 'feedback', label: 'Feedback', tip: 'Feedback: report an issue or suggest an idea on GitHub' },
  { id: 'github', href: REPO_URL, icon: 'github', tip: 'Source code on GitHub' },
  { id: 'support', href: SUPPORT_URL, icon: 'coffee', label: 'Support', tip: 'Support SC Keymap: buy me a coffee on Ko-fi', accent: true },
];

export function HeaderLinks() {
  return (
    <nav className="flex items-center gap-1 sm:gap-1.5" aria-label="Support and feedback" data-testid="header-links">
      {LINKS.map((l) => (
        <Tip key={l.id} label={<>{l.tip} <span className="text-slate-400">(opens in a new tab)</span></>} testid={`tip-${l.id}`}>
          <a href={l.href} target="_blank" rel="noopener noreferrer" data-testid={`link-${l.id}`} aria-label={`${l.tip} (opens in a new tab)`}
            className={`flex h-8 min-w-8 items-center justify-center gap-1.5 rounded border px-1.5 text-slate-300 sm:px-2 transition hover:text-hud2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-hud ${l.label ? 'lg:px-2.5' : ''} ${l.accent ? 'border-hud/40 bg-hud/5 hover:border-hud hover:bg-hud/10 hover:shadow-[0_0_12px_-3px_rgba(79,216,255,.7)]' : 'border-edge hover:border-hud/60'}`}>
            <Ico name={l.icon} className="h-4 w-4" />
            {l.label && <span className="hidden font-display text-xs font-semibold uppercase tracking-wider lg:inline">{l.label}</span>}
          </a>
        </Tip>
      ))}
    </nav>
  );
}
