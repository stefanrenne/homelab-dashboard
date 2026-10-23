// Maps fields of a JSON response to blocks.

/** Reads `a.b.0.c` from an object. */
export function pick(obj, field) {
  return String(field)
    .split('.')
    .reduce((node, key) => (node === null || node === undefined ? undefined : node[key]), obj);
}

export default {
  async fetch(ctx) {
    const { url, method, headers = {}, mappings } = ctx.options;
    const res = await ctx.fetch(url, { method, headers: { accept: 'application/json', ...headers } });
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    const json = await res.json();
    const blocks = mappings.map((m, i) => {
      if (!m || typeof m.field !== 'string') throw new Error(`mappings[${i}]: needs a "field"`);
      let value = pick(json, m.field);
      if (typeof value === 'number' && typeof m.scale === 'number') value *= m.scale;
      if (value !== null && value !== undefined && typeof value !== 'number') value = String(value);
      return { label: m.label ?? m.field, value: value ?? null, ...(m.unit ? { unit: String(m.unit) } : {}) };
    });
    return { blocks };
  },
};
