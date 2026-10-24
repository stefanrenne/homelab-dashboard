// CPU, memory, disk, CPU temperature, uptime and network via node:os, fs.statfs and /sys
// (Linux; on macOS temperature and network are left out). homepage's resources widget.
//
// `blocks` carry the values (for the plain block look and `fields`), `meters` the
// homepage-style text for client.js: "25.7 TB Free" with a usage bar.
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

// Host paths, replaceable in tests. In Docker, mount /sys read-only to see a host interface.
export const PATHS = { sys: '/sys', proc: '/proc' };

const level = (pct) => (pct >= 95 ? 'error' : pct >= 85 ? 'warn' : 'ok');
const round = (n) => Math.round(n * 10) / 10;
const DECIMAL = ['B', 'kB', 'MB', 'GB', 'TB', 'PB']; // as in every widget
const BINARY = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']; // diskUnits: bbytes

export function formatBytes(n, binary = false) {
  const step = binary ? 1024 : 1000;
  const units = binary ? BINARY : DECIMAL;
  let i = 0;
  while (n >= step && i < units.length - 1) {
    n /= step;
    i++;
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : round(n)} ${units[i]}`;
}

/** 93784 s -> "1d 2h", 3700 -> "1h 1m", 59 -> "0m". */
export function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
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

/** The highest temperature of the thermal zones, in °C, or null (no zones, e.g. macOS). */
export async function cpuTemperature() {
  const base = path.join(PATHS.sys, 'class', 'thermal');
  let zones;
  try {
    zones = (await fs.readdir(base)).filter((d) => d.startsWith('thermal_zone'));
  } catch {
    return null;
  }
  const temps = [];
  for (const zone of zones) {
    try {
      const milli = Number((await fs.readFile(path.join(base, zone, 'temp'), 'utf8')).trim());
      if (Number.isFinite(milli) && milli > 0) temps.push(milli / 1000);
    } catch { /* a zone without a reading */ }
  }
  return temps.length ? Math.max(...temps) : null;
}

/** The interface of the default route, else the first one that is not loopback. */
export async function defaultInterface() {
  try {
    for (const line of (await fs.readFile(path.join(PATHS.proc, 'net', 'route'), 'utf8')).split('\n').slice(1)) {
      const [iface, destination] = line.trim().split(/\s+/);
      if (destination === '00000000') return iface;
    }
  } catch { /* no /proc (macOS) */ }
  try {
    return (await fs.readdir(path.join(PATHS.sys, 'class', 'net'))).find((i) => i !== 'lo') ?? null;
  } catch {
    return null;
  }
}

async function interfaceBytes(iface) {
  const dir = path.join(PATHS.sys, 'class', 'net', iface, 'statistics');
  const read = async (f) => Number((await fs.readFile(path.join(dir, f), 'utf8')).trim());
  return { rx: await read('rx_bytes'), tx: await read('tx_bytes') };
}

export default {
  async fetch(ctx) {
    const o = ctx.options;
    const blocks = [];
    const meters = [];
    const binary = o.diskUnits === 'bbytes';
    if (o.cpu) {
      // Usage since the previous call; the first call has no previous sample yet.
      const now = cpuTimes();
      const prev = ctx.cache.get('cpu');
      ctx.cache.set('cpu', now);
      const pct = prev && now.total > prev.total ? round(100 * (1 - (now.idle - prev.idle) / (now.total - prev.total))) : null;
      blocks.push({ key: 'cpu', label: 'cpu', value: pct, unit: '%', ...(pct === null ? {} : { status: level(pct) }) });
      meters.push({ kind: 'cpu', text: pct === null ? '–' : `${Math.round(pct)}%`, caption: 'cpu', percent: pct ?? 0,
        ...(o.expanded ? { detail: String(round(os.loadavg()[0])), detailCaption: 'load' } : {}) });
    }
    if (o.memory) {
      const total = os.totalmem();
      const free = os.freemem();
      const pct = round(100 * (1 - free / total));
      blocks.push({ key: 'memory', label: 'memory', value: pct, unit: '%', status: level(pct) });
      meters.push({ kind: 'memory', text: formatBytes(free), caption: 'free', percent: pct,
        ...(o.expanded ? { detail: `${formatBytes(total - free)} / ${formatBytes(total)}` } : {}) });
    }
    for (const mount of o.disk) {
      const label = o.disk.length > 1 ? mount : 'disk';
      try {
        const s = await fs.statfs(mount);
        const pct = round(100 * (1 - s.bavail / s.blocks));
        blocks.push({ key: label, label, value: pct, unit: '%', status: level(pct) });
        meters.push({ kind: 'disk', text: formatBytes(s.bavail * s.bsize, binary), caption: 'free', percent: pct, mount,
          ...(o.expanded ? { detail: `${formatBytes((s.blocks - s.bavail) * s.bsize, binary)} / ${formatBytes(s.blocks * s.bsize, binary)}` } : {}) });
      } catch (err) {
        ctx.log.warn(`cannot read ${mount}: ${err.code || err.message}`);
        blocks.push({ key: label, label, value: null, status: 'unknown' });
        meters.push({ kind: 'disk', text: mount, caption: 'notFound', percent: 0, mount, missing: true });
      }
    }
    if (o.cputemp) {
      const celsius = await cpuTemperature();
      const imperial = o.units === 'imperial';
      const value = celsius === null ? null : round(imperial ? celsius * 9 / 5 + 32 : celsius);
      const min = o.tempmin ?? (imperial ? 32 : 0);
      const max = o.tempmax ?? (imperial ? 212 : 100);
      const pct = value === null ? 0 : Math.max(0, Math.min(100, (100 * (value - min)) / (max - min || 1)));
      blocks.push({ key: 'cputemp', label: 'cputemp', value, unit: imperial ? '°F' : '°C', ...(value === null ? { status: 'unknown' } : { status: level(pct) }) });
      meters.push({ kind: 'cputemp', text: value === null ? '–' : `${Math.round(value)}°${imperial ? 'F' : 'C'}`, caption: 'temp', percent: pct });
    }
    if (o.uptime) {
      const text = formatUptime(os.uptime());
      blocks.push({ key: 'uptime', label: 'uptime', value: text });
      meters.push({ kind: 'uptime', text, caption: 'up', percent: 0, noBar: true });
    }
    if (o.network !== undefined && o.network !== 'false') {
      const iface = o.network === 'true' || o.network === 'default' ? await defaultInterface() : o.network;
      let rx = null;
      let tx = null;
      try {
        if (!iface) throw new Error('no network interface found');
        const now = { ...(await interfaceBytes(iface)), at: Date.now() };
        const prev = ctx.cache.get(`net:${iface}`);
        ctx.cache.set(`net:${iface}`, now);
        if (prev && now.at > prev.at) {
          const secs = (now.at - prev.at) / 1000;
          rx = Math.max(0, (now.rx - prev.rx) / secs);
          tx = Math.max(0, (now.tx - prev.tx) / secs);
        }
      } catch (err) {
        ctx.log.warn(`network ${iface ?? ''}: ${err.code || err.message}`);
      }
      const rate = (n) => (n === null ? null : `${formatBytes(n)}/s`);
      blocks.push({ key: 'rx', label: 'rx', value: rate(rx) }, { key: 'tx', label: 'tx', value: rate(tx) });
      meters.push({ kind: 'network', text: `↓ ${rate(rx) ?? '–'}  ↑ ${rate(tx) ?? '–'}`, caption: iface ?? 'network', percent: 0, noBar: true });
    }
    return { blocks, meters };
  },
};
