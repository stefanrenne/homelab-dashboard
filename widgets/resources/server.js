// CPU, memory and disk usage via node:os and fs.statfs (works on Linux and macOS).
import os from 'node:os';
import fs from 'node:fs/promises';

const level = (pct) => (pct >= 95 ? 'error' : pct >= 85 ? 'warn' : 'ok');
const round = (n) => Math.round(n * 10) / 10;

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const [kind, ms] of Object.entries(cpu.times)) {
      total += ms;
      if (kind === 'idle') idle += ms;
    }
  }
  return { idle, total };
}

export default {
  async fetch(ctx) {
    const blocks = [];
    if (ctx.options.cpu) {
      // Usage since the previous call; the first call has no previous sample yet.
      const now = cpuTimes();
      const prev = ctx.cache.get('cpu');
      ctx.cache.set('cpu', now);
      if (prev && now.total > prev.total) {
        const pct = round(100 * (1 - (now.idle - prev.idle) / (now.total - prev.total)));
        blocks.push({ label: 'cpu', value: pct, unit: '%', status: level(pct) });
      } else {
        blocks.push({ label: 'cpu', value: null, unit: '%' });
      }
    }
    if (ctx.options.memory) {
      const pct = round(100 * (1 - os.freemem() / os.totalmem()));
      blocks.push({ label: 'memory', value: pct, unit: '%', status: level(pct) });
    }
    for (const mount of ctx.options.disk) {
      try {
        const s = await fs.statfs(mount);
        const pct = round(100 * (1 - s.bavail / s.blocks));
        blocks.push({ label: ctx.options.disk.length > 1 ? mount : 'disk', value: pct, unit: '%', status: level(pct) });
      } catch (err) {
        ctx.log.warn(`cannot read ${mount}: ${err.code || err.message}`);
        blocks.push({ label: mount, value: null, status: 'unknown' });
      }
    }
    return { blocks };
  },
};
