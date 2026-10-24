// Container state and stats from the Docker Engine API (read-only GET calls).

const DEFAULT_SOCKET = '/var/run/docker.sock';

export function cpuPercent(stats) {
  const cpu = stats.cpu_stats;
  const pre = stats.precpu_stats;
  if (!cpu?.cpu_usage || !pre?.cpu_usage || !cpu.system_cpu_usage || !pre.system_cpu_usage) return null;
  const delta = cpu.cpu_usage.total_usage - pre.cpu_usage.total_usage;
  const system = cpu.system_cpu_usage - pre.system_cpu_usage;
  const cpus = cpu.online_cpus || cpu.cpu_usage.percpu_usage?.length || 1;
  return system > 0 ? Math.round((delta / system) * cpus * 1000) / 10 : 0;
}

/** Memory in use without the page cache, in decimal megabytes (like every widget). */
export function memoryMB(stats) {
  const usage = stats.memory_stats?.usage;
  if (usage === undefined) return null;
  const cache = stats.memory_stats.stats?.inactive_file ?? stats.memory_stats.stats?.cache ?? 0;
  return Math.round((usage - cache) / 1e6);
}

/**
 * A Docker Swarm service by name (docker.yaml swarm: true): running tasks against the wanted
 * replicas, as in homepage, and stats when a running task's container is on this node.
 */
async function swarmService(get, name) {
  const service = await get(`/services/${name}`);
  if (!service) return null;
  const filters = encodeURIComponent(JSON.stringify({ service: [service.ID], 'desired-state': ['running'] }));
  const tasks = ((await get(`/tasks?filters=${filters}`)) ?? []).filter((t) => t.Status?.State === 'running');
  const wanted = service.Spec?.Mode?.Replicated ? Number(service.Spec.Mode.Replicated.Replicas ?? 1) : null;
  const running = tasks.length;
  const full = wanted === null ? running > 0 : running >= wanted && wanted > 0;
  const status = full ? 'up' : running > 0 ? 'warn' : 'down';
  const state = full ? 'running' : running > 0 ? 'partial' : 'exited';
  const blocks = [
    { label: 'status', value: state, status: status === 'up' ? 'ok' : status === 'warn' ? 'warn' : 'error' },
    { key: 'replicas', label: 'replicas', value: wanted === null ? running : `${running}/${wanted}`, ...(full ? {} : { status: running > 0 ? 'warn' : 'error' }) },
  ];
  for (const task of tasks) {
    const id = task.Status?.ContainerStatus?.ContainerID;
    const stats = id ? await get(`/containers/${encodeURIComponent(id)}/stats?stream=false`).catch(() => null) : null;
    if (!stats) continue;
    blocks.push({ label: 'cpu', value: cpuPercent(stats), unit: '%' });
    blocks.push({ label: 'memory', value: memoryMB(stats), unit: 'MB' });
    break;
  }
  return { status, statusText: state, blocks };
}

export default {
  async fetch(ctx) {
    const { container, url, tlsCa, tlsCert, tlsKey } = ctx.options;
    const tls = tlsCa || tlsCert ? { tls: { ca: tlsCa, cert: tlsCert, key: tlsKey } } : {};
    const get = async (path) => {
      const res = url
        ? await ctx.fetch(path, tls)
        : await ctx.fetch(path, { socketPath: ctx.options.socket || DEFAULT_SOCKET });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Docker API answered ${res.status}`);
      return res.json();
    };
    const name = encodeURIComponent(container);
    const info = await get(`/containers/${name}/json`);
    if (!info && ctx.options.swarm) {
      const service = await swarmService(get, name);
      if (service) return service;
    }
    if (!info) return { status: 'down', statusText: 'not found', blocks: [{ label: 'status', value: 'not found', status: 'error' }] };
    const state = info.State?.Status ?? 'unknown';
    const health = info.State?.Health?.Status;
    const blocks = [{ label: 'status', value: health ? `${state} (${health})` : state }];
    let status = 'down';
    if (state === 'running') {
      status = health === 'unhealthy' ? 'warn' : 'up';
      const stats = await get(`/containers/${name}/stats?stream=false`);
      if (stats) {
        blocks.push({ label: 'cpu', value: cpuPercent(stats), unit: '%' });
        blocks.push({ label: 'memory', value: memoryMB(stats), unit: 'MB' });
      }
    }
    blocks[0].status = status === 'up' ? 'ok' : status === 'warn' ? 'warn' : 'error';
    return { status, statusText: health ?? state, blocks };
  },
};
