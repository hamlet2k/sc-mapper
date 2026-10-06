import { Ico } from './icons';
/** category icon (sidebar); kept for existing imports, drawn from the shared icon set */
export function Icon({ name, className = 'h-4 w-4' }: { name: string; className?: string }) {
  return <Ico name={name} className={className} strokeWidth={1.6} />;
}
