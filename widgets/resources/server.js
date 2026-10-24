// CPU, memory and disk usage via node:os and fs.statfs (works on Linux and macOS).
//
// `blocks` carry the percentages (for the plain block look and `fields`), `meters` the
// homepage-style text for client.js: "25.7 TB Free" with a usage bar.
import os from 'node:os';
import fs from 'node:fs/promises';

const level = (pct) => (pct >= 95 ? 'error' : pct >= 85 ? 'warn' : 'ok');
const round = (n) => Math.round(n * 10) / 10;
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function formatBytes(n) {
  let i = 0;
  while (n >= 1000 && i < UNITS.length - 1) {
    n /= 1000;
    i++;
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : round(n)} ${UNITS[i]}`;
}

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
    const meters = [];
    if (ctx.options.cpu) {
      // Usage since the previous call; the first call has no previous sample yet.
      const now = cpuTimes();
      const prev = ctx.cache.get('cpu');
      ctx.cache.set('cpu', now);
      const pct = prev && now.total > prev.total ? round(100 * (1 - (now.idle - prev.idle) / (now.total - prev.total))) : null;
      blocks.push({ key: 'cpu', label: 'cpu', value: pct, unit: '%', ...(pct === null ? {} : { status: level(pct) }) });
      meters.push({ kind: 'cpu', text: pct === null ? '–' : `${Math.round(pct)}%`, caption: 'cpu', percent: pct ?? 0 });
    }
    if (ctx.options.memory) {
      const free = os.freemem();
      const pct = round(100 * (1 - free / os.totalmem()));
      blocks.push({ key: 'memory', label: 'memory', value: pct, unit: '%', status: level(pct) });
      meters.push({ kind: 'memory', text: formatBytes(free), caption: 'free', percent: pct });
    }
    for (const mount of ctx.options.disk) {
      const label = ctx.options.disk.length > 1 ? mount : 'disk';
      try {
        const s = await fs.statfs(mount);
        const pct = round(100 * (1 - s.bavail / s.blocks));
        blocks.push({ key: label, label, value: pct, unit: '%', status: level(pct) });
        meters.push({ kind: 'disk', text: formatBytes(s.bavail * s.bsize), caption: 'free', percent: pct, mount });
      } catch (err) {
        ctx.log.warn(`cannot read ${mount}: ${err.code || err.message}`);
        blocks.push({ key: label, label, value: null, status: 'unknown' });
        meters.push({ kind: 'disk', text: '–', caption: 'free', percent: 0, mount });
      }
    }
    return { blocks, meters };
  },
};
