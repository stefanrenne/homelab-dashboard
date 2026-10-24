// State, CPU and memory of a Proxmox VM or LXC container (GET .../status/current), as in
// homepage's proxmoxNode/proxmoxVMID and its proxmoxvm widget.

const NODE = /^[A-Za-z0-9._-]+$/;

/** Memory in decimal units: MB below 1 GB, GB with one decimal from there. */
export function memoryBlock(bytes) {
  if (typeof bytes !== 'number') return { key: 'mem', label: 'memory', value: null };
  return bytes < 1e9
    ? { key: 'mem', label: 'memory', value: Math.round(bytes / 1e6), unit: 'MB' }
    : { key: 'mem', label: 'memory', value: Math.round(bytes / 1e8) / 10, unit: 'GB' };
}

export default {
  async fetch(ctx) {
    const { url, token, secret, node, vmid, type, insecure } = ctx.options;
    if (!NODE.test(node) || node.includes('..')) throw new Error('node: letters, digits, dots, dashes and underscores');
    if (!/^\d+$/.test(vmid)) throw new Error('vmid: a number');
    const res = await ctx.fetch(`${url.replace(/\/+$/, '')}/api2/json/nodes/${node}/${type}/${vmid}/status/current`, {
      headers: { authorization: `PVEAPIToken=${token}=${secret}` },
      insecure,
    });
    // Proxmox answers 500 ("does not exist") for an unknown id on a known node
    if (res.status === 404 || res.status === 500) {
      return { status: 'down', statusText: 'not found', blocks: [{ key: 'status', label: 'status', value: 'not found', status: 'error' }] };
    }
    if (!res.ok) throw new Error(`Proxmox status answered ${res.status}`);
    const data = (await res.json())?.data;
    if (!data) throw new Error('Proxmox status answered without data');
    // a paused VM reports status running with qmpstatus paused
    const state = data.qmpstatus === 'paused' ? 'paused' : data.status === 'stopped' ? 'stopped' : data.status ?? 'unknown';
    const status = state === 'running' ? 'up' : state === 'paused' ? 'warn' : state === 'stopped' ? 'down' : 'unknown';
    const blocks = [{ key: 'status', label: 'status', value: state, status: status === 'up' ? 'ok' : status === 'warn' ? 'warn' : status === 'down' ? 'error' : 'unknown' }];
    if (state === 'running' || state === 'paused') {
      blocks.push({ key: 'cpu', label: 'cpu', value: typeof data.cpu === 'number' ? Math.round(data.cpu * 1000) / 10 : null, unit: '%' });
      blocks.push(memoryBlock(data.mem));
    }
    return { status, statusText: state, blocks };
  },
};
