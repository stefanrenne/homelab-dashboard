// State, CPU and memory of an app's pods, as homepage's app/namespace/podSelector: the pods by
// label selector, usage from metrics-server (metrics.k8s.io), CPU as a share of the pods'
// limits when they have them. RBAC: list on pods and pods.metrics.k8s.io.
import { k8sJson, cores, bytes } from '../kubernetes/server.js';

export const APP_LABEL = 'app.kubernetes.io/name';
const READY = ['Running', 'Succeeded'];

/** Memory in decimal units: MB below 1 GB, GB with one decimal from there. */
function memoryBlock(b) {
  return b < 1e9
    ? { key: 'mem', label: 'memory', value: Math.round(b / 1e6), unit: 'MB' }
    : { key: 'mem', label: 'memory', value: Math.round(b / 1e8) / 10, unit: 'GB' };
}

export default {
  async fetch(ctx) {
    const { namespace, app, podSelector } = ctx.options;
    if (podSelector === undefined && !app) throw new Error('app or podSelector: required');
    // an empty podSelector selects every pod in the namespace (homepage's note)
    const selector = podSelector ?? `${APP_LABEL}=${app}`;
    const ns = encodeURIComponent(namespace);
    const list = await k8sJson(ctx, `/api/v1/namespaces/${ns}/pods?labelSelector=${encodeURIComponent(selector)}`);
    const pods = list.items ?? [];
    if (pods.length === 0) {
      return { status: 'down', statusText: 'not found', blocks: [{ key: 'status', label: 'status', value: 'not found', status: 'error' }] };
    }
    const ready = pods.filter((p) => READY.includes(p.status?.phase)).length;
    const state = ready === pods.length ? 'running' : ready > 0 ? 'partial' : 'not running';
    const status = state === 'running' ? 'up' : state === 'partial' ? 'warn' : 'down';
    const blocks = [
      { key: 'status', label: 'status', value: state, status: status === 'up' ? 'ok' : status },
      { key: 'pods', label: 'pods', value: `${ready}/${pods.length}`, ...(status === 'up' ? {} : { status: status === 'warn' ? 'warn' : 'error' }) },
    ];
    if (ready > 0) {
      const names = new Set(pods.map((p) => p.metadata?.name));
      let cpuLimit = 0;
      for (const p of pods) for (const c of p.spec?.containers ?? []) cpuLimit += cores(c.resources?.limits?.cpu);
      const metrics = await k8sJson(ctx, `/apis/metrics.k8s.io/v1beta1/namespaces/${ns}/pods`).catch((err) => {
        ctx.log.warn(`kubernetes pod metrics: ${err.message} (is metrics-server installed?)`);
        return null;
      });
      if (metrics) {
        let cpu = 0;
        let mem = 0;
        for (const m of metrics.items ?? []) {
          if (!names.has(m.metadata?.name)) continue;
          for (const c of m.containers ?? []) {
            cpu += cores(c.usage?.cpu);
            mem += bytes(c.usage?.memory);
          }
        }
        blocks.push(cpuLimit > 0
          ? { key: 'cpu', label: 'cpu', value: Math.round((1000 * cpu) / cpuLimit) / 10, unit: '%' }
          : { key: 'cpu', label: 'cpu', value: Math.round(cpu * 1000) / 1000 }); // cores, as in homepage, without limits
        blocks.push(memoryBlock(mem));
      }
    }
    return { status, statusText: state, blocks };
  },
};
