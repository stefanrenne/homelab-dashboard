// Maps fields of a JSON response to blocks (or rows with `display: list`).

/** Reads `a.b.0.c` from an object. */
export function pick(obj, field) {
  return String(field)
    .split('.')
    .reduce((node, key) => (node === null || node === undefined ? undefined : node[key]), obj);
}

// Decimal units (1 kB = 1000 B), the same in every widget.
const BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];

export function formatBytes(n) {
  let i = 0;
  while (Math.abs(n) >= 1000 && i < BYTE_UNITS.length - 1) {
    n /= 1000;
    i++;
  }
  return `${Math.round(n * 10) / 10} ${BYTE_UNITS[i]}`;
}

/** Applies scale, remap, format, prefix and suffix of one mapping to a raw value. */
export function mapValue(m, raw) {
  let value = raw;
  if (Array.isArray(m.remap)) {
    const hit = m.remap.find((r) => r && !r.any && String(r.value) === String(value)) ?? m.remap.find((r) => r && r.any);
    if (hit) value = hit.to;
  }
  if (value === undefined || value === null || value === '') return { value: null };
  if (typeof value === 'number' && typeof m.scale === 'number') value *= m.scale;
  let unit = m.suffix ?? m.unit ? String(m.suffix ?? m.unit) : undefined; // `unit` is the 1.0 name
  switch (m.format) {
    case 'bytes':
      value = formatBytes(Number(value));
      break;
    case 'percent':
      value = Number(value);
      unit ??= '%';
      break;
    case 'number':
      value = Number(value);
      break;
    default:
      if (typeof value !== 'number') value = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  if (m.prefix) value = `${m.prefix}${value}`;
  return { value, unit };
}

export default {
  async fetch(ctx) {
    const { url, method, headers = {}, body, mappings, display } = ctx.options;
    const init = { method, headers: { accept: 'application/json', ...headers } };
    if (body && method === 'POST') {
      init.body = JSON.stringify(body);
      init.headers['content-type'] = 'application/json';
    }
    const res = await ctx.fetch(url, init);
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    const json = await res.json();
    const mapped = mappings.map((m, i) => {
      if (!m || typeof m.field !== 'string') throw new Error(`mappings[${i}]: needs a "field"`);
      const { value, unit } = mapValue(m, pick(json, m.field));
      return { label: m.label ?? m.field, value, ...(unit ? { unit } : {}) };
    });
    if (display === 'list') {
      return {
        rows: mapped.map((b) => ({ label: b.label, value: b.value === null ? '' : b.unit ? `${b.value} ${b.unit}` : b.value })),
      };
    }
    return { blocks: mapped };
  },
};
