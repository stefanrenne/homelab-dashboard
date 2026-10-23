// Up/down check of a URL with its response time.
//
// 2xx/3xx and 401/403 (a login in front of the service) count as up, other 4xx as a
// warning, 5xx and connection errors as down.

function classify(code) {
  if (code < 400 || code === 401 || code === 403) return ['up', 'ok'];
  if (code < 500) return ['warn', 'warn'];
  return ['down', 'error'];
}

export default {
  async fetch(ctx) {
    const start = performance.now();
    let res;
    try {
      res = await ctx.fetch(ctx.options.url, { method: ctx.options.method, redirect: 'manual' });
      if (res.status === 405 && ctx.options.method === 'HEAD') {
        res = await ctx.fetch(ctx.options.url, { method: 'GET', redirect: 'manual' });
      }
      await res.body?.cancel();
    } catch (err) {
      if (ctx.signal.aborted) throw err;
      return { status: 'down', blocks: [{ label: 'status', value: 'offline', status: 'error' }] };
    }
    const latency = Math.round(performance.now() - start);
    const [status, blockStatus] = classify(res.status);
    return {
      status,
      latency,
      blocks: [
        { label: 'status', value: res.status, status: blockStatus },
        { label: 'latency', value: latency, unit: 'ms' },
      ],
    };
  },
};
