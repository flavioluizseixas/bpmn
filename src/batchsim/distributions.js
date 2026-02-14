
export function sampleDist(spec, rng) {
  if (!spec || typeof spec !== 'object') return 0;

  const t = spec.type || 'fixed';
  if (t === 'fixed') return Number(spec.value ?? 0);

  if (t === 'uniform') {
    const a = Number(spec.min ?? 0);
    const b = Number(spec.max ?? a);
    return a + (b - a) * rng();
  }

  if (t === 'exponential') {
    const mean = Number(spec.mean ?? 1);
    const u = Math.max(1e-12, rng());
    return -Math.log(u) * mean;
  }

  if (t === 'normal') {
    const mu = Number(spec.mean ?? 0);
    const sigma = Number(spec.sd ?? 1);
    const u1 = Math.max(1e-12, rng());
    const u2 = rng();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, mu + sigma * z0);
  }

  return 0;
}
