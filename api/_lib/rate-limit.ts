/** Best effort, per function instance. Not a distributed or durable limit. */
export function createRateLimiter(now: () => number = Date.now) {
  const ips = new Map<string, number[]>();
  return (ip: string): boolean => {
    const t = now(), day = 86400000;
    for (const [key, values] of ips) if (values.at(-1)! <= t - day) ips.delete(key);
    const values = (ips.get(ip) ?? []).filter((v) => v > t - day);
    if (values.length >= 20 || values.filter((v) => v > t - 600000).length >= 5) return false;
    ips.set(ip, [...values, t]);
    return true;
  };
}
