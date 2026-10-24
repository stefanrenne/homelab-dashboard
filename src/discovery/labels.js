// Turns discovery labels/annotations into a service definition in services.yaml form.
//
//   <prefix>name, <prefix>group, <prefix>weight, <prefix>href, <prefix>icon, <prefix>description,
//   <prefix>siteMonitor, <prefix>ping, <prefix>target, <prefix>statusStyle, <prefix>showStats,
//   <prefix>widget.type, <prefix>widget.<option>, <prefix>widget.<map>.<key>,
//   <prefix>widget.mappings[0].label, <prefix>widgets[1].type   (homepage's dot/index notation)
//
// With settings.instanceName, <prefix>instance.<name>.<key> wins over <prefix><key> for that
// dashboard and is ignored by the others (homepage's multiple instances).
//
// Docker uses the prefix "homelab." (or homepage's "homepage."), Kubernetes "homelab.dev/"
// (or "gethomepage.dev/").

const FIELDS = ['href', 'icon', 'description', 'siteMonitor', 'ping', 'target', 'statusStyle', 'showStats'];
const NESTED = ['widget', 'widgets'];

/** `widgets[1].mappings[0].label` -> ['widgets', 1, 'mappings', 0, 'label']; null when malformed. */
function pathOf(key) {
  const parts = [];
  for (const segment of key.split('.')) {
    const m = /^([^[\]]+)((?:\[\d+\])*)$/.exec(segment);
    if (!m) return null;
    parts.push(m[1], ...[...m[2].matchAll(/\[(\d+)\]/g)].map((x) => Number(x[1])));
  }
  return parts;
}

function setPath(root, parts, value) {
  let node = root;
  parts.forEach((part, i) => {
    if (i === parts.length - 1) {
      node[part] = value;
      return;
    }
    const wantArray = typeof parts[i + 1] === 'number';
    const ok = wantArray ? Array.isArray(node[part]) : node[part] !== null && typeof node[part] === 'object' && !Array.isArray(node[part]);
    if (!ok) node[part] = wantArray ? [] : {};
    node = node[part];
  });
}

/** The labels under `prefix`, with this instance's labels applied and other instances' left out. */
function ownLabels(labels, prefix, instanceName) {
  const plain = {};
  const mine = {};
  const instance = prefix + 'instance.';
  for (const [key, value] of Object.entries(labels)) {
    if (!key.startsWith(prefix)) continue;
    if (key.startsWith(instance)) {
      const rest = key.slice(instance.length);
      const dot = rest.indexOf('.');
      if (instanceName && dot > 0 && rest.slice(0, dot) === instanceName) mine[rest.slice(dot + 1)] = value;
      continue;
    }
    plain[key.slice(prefix.length)] = value;
  }
  return { ...plain, ...mine };
}

export function serviceFromLabels(labels, prefix, instanceName = null) {
  const own = ownLabels(labels, prefix, instanceName);
  const name = own.name;
  if (!name) return null;
  const def = {};
  for (const key of FIELDS) if (own[key] !== undefined && own[key] !== '') def[key] = parseValue(own[key]);
  for (const [key, value] of Object.entries(own)) {
    const parts = pathOf(key);
    if (!parts || !NESTED.includes(parts[0]) || parts.length < 2) continue;
    setPath(def, parts, parseValue(value));
  }
  if (!def.widget?.type) delete def.widget;
  if (Array.isArray(def.widgets)) def.widgets = def.widgets.filter((w) => w && w.type);
  if (!def.widgets?.length) delete def.widgets;
  for (const key of ['href', 'icon', 'description', 'siteMonitor', 'ping', 'target']) if (def[key] !== undefined) def[key] = String(def[key]);
  const weight = Number(own.weight);
  return { group: own.group || null, name, def, weight: Number.isFinite(weight) ? weight : 0 };
}

/** Label values are strings; JSON-looking values (lists, maps, numbers, booleans) are parsed. */
function parseValue(value) {
  if (typeof value !== 'string') return value;
  if (/^(\[|\{|-?\d+(\.\d+)?$|true$|false$)/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
