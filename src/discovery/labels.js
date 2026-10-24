// Turns discovery labels/annotations into a service definition in services.yaml form.
//
//   <prefix>name, <prefix>group, <prefix>href, <prefix>icon, <prefix>description,
//   <prefix>siteMonitor, <prefix>ping, <prefix>weight,
//   <prefix>widget.type, <prefix>widget.<option>, <prefix>widget.<map>.<key>
//
// Docker uses the prefix "homelab." (or homepage's "homepage."), Kubernetes "homelab.dev/"
// (or "gethomepage.dev/").

const FIELDS = ['href', 'icon', 'description', 'siteMonitor', 'ping'];

export function serviceFromLabels(labels, prefix) {
  const get = (key) => labels[prefix + key];
  const name = get('name');
  if (!name) return null;
  const def = {};
  for (const key of FIELDS) if (get(key)) def[key] = get(key);
  const widget = {};
  for (const [key, value] of Object.entries(labels)) {
    if (!key.startsWith(prefix + 'widget.')) continue;
    const parts = key.slice(prefix.length + 'widget.'.length).split('.');
    let node = widget;
    while (parts.length > 1) {
      const part = parts.shift();
      node[part] = typeof node[part] === 'object' && node[part] !== null ? node[part] : {};
      node = node[part];
    }
    node[parts[0]] = parseValue(value);
  }
  if (widget.type) def.widget = widget;
  const weight = Number(get('weight'));
  return { group: get('group') || null, name, def, weight: Number.isFinite(weight) ? weight : 0 };
}

/** Label values are strings; JSON-looking values (lists, maps, numbers, booleans) are parsed. */
function parseValue(value) {
  if (/^(\[|\{|-?\d+(\.\d+)?$|true$|false$)/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
