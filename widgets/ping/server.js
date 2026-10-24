// One ICMP echo through the system `ping` binary.
import { execFile } from 'node:child_process';

const HOST = /^[A-Za-z0-9_][A-Za-z0-9._:-]*$/;

export function parseLatency(output) {
  const match = /time[=<]\s*([\d.]+)\s*ms/.exec(output);
  return match ? Math.round(Number(match[1]) * 10) / 10 : null;
}

/** `http://192.168.1.2` (homepage style) and `nas.lan` both mean the host. */
export function hostOf(value) {
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return new URL(value).hostname.replace(/^\[|\]$/g, '');
  } catch {
    // fall through: validated below
  }
  return value;
}

export default {
  async fetch(ctx) {
    const host = hostOf(ctx.options.host);
    if (!HOST.test(host)) throw new Error(`invalid host "${host}"`);
    const result = await new Promise((resolve) => {
      execFile('ping', ['-c', '1', host], { signal: ctx.signal, timeout: 5000 }, (err, stdout) =>
        resolve({ ok: !err, stdout: String(stdout ?? ''), err }),
      );
    });
    if (ctx.signal.aborted) throw ctx.signal.reason;
    if (result.err?.code === 'ENOENT') throw new Error('the "ping" binary is not installed');
    if (!result.ok) return { status: 'down', blocks: [{ label: 'status', value: 'offline', status: 'error' }] };
    const latency = parseLatency(result.stdout);
    return {
      status: 'up',
      latency,
      blocks: [{ label: 'latency', value: latency, unit: 'ms', status: 'ok' }],
    };
  },
};
