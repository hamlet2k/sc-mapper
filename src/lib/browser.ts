// Which browser engine is running: Chromium-based browsers limit what the Gamepad API exposes.
/** Chromium (Chrome, Edge, Brave, Opera, Vivaldi, Arc, Comet...) exposes at most 4 controllers to a page */
export const CHROMIUM_PAD_CAP = 4;

type UAData = { brands?: { brand: string }[] };
export function browserName(
  ua = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  data: UAData | undefined = typeof navigator !== 'undefined' ? (navigator as Navigator & { userAgentData?: UAData }).userAgentData : undefined,
  brave = typeof navigator !== 'undefined' && 'brave' in navigator,
): { name: string; chromium: boolean } {
  const v = (re: RegExp) => re.exec(ua)?.[1] ?? '';
  const brands = (data?.brands ?? []).map((b) => b.brand);
  if (/Firefox\//.test(ua)) return { name: `Firefox ${v(/Firefox\/(\d+)/)}`, chromium: false };
  const chromium = /Chrome\/|Chromium\//.test(ua) || brands.includes('Chromium');
  if (chromium) {
    const ver = v(/Chrom(?:e|ium)\/(\d+)/);
    if (/Edg\//.test(ua)) return { name: `Edge ${v(/Edg\/(\d+)/)}`, chromium };
    if (/OPR\//.test(ua)) return { name: `Opera ${v(/OPR\/(\d+)/)}`, chromium };
    if (brave || brands.includes('Brave')) return { name: `Brave (Chromium ${ver})`, chromium };
    const named = brands.find((b) => !/Chromium|Not.?A.?Brand|Google Chrome/i.test(b));
    if (named) return { name: `${named} (Chromium ${ver})`, chromium };
    return { name: `${/HeadlessChrome/.test(ua) ? 'Headless Chrome' : 'Chrome'} ${ver}`, chromium };
  }
  if (/Safari\//.test(ua)) return { name: `Safari ${v(/Version\/(\d+)/)}`, chromium: false };
  return { name: ua.slice(0, 40) || 'unknown', chromium: false };
}
export const isChromium = () => browserName().chromium;
