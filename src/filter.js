// A service's `filter:` (hides the card while the expression is true), on the attributes its
// widgets publish (widget.yaml `attributes:`). A small expression language, parsed here and
// never evaluated as code:
//
//   filter: widget.update == false
//   filter: widgets.shelly.update == false && widgets[1].count < 3
//
// Paths: widget.<attr> (the attributes of all the service's widgets, merged: the first widget, in
// the card's order, that publishes it), widgets[<n>].<attr> (one widget by position, from 0),
// widgets.<type>.<attr> (the first widget of that type). Literals: true, false, null, numbers,
// 'text' or "text". Operators: == != < <= > >= && || ! and parentheses. A missing attribute is
// null. The page evaluates the parsed form (public/index.html, evalFilter) against the results.

const OPS = ['==', '!=', '<=', '>=', '<', '>', '&&', '||', '!', '(', ')'];
const COMPARE = ['==', '!=', '<', '<=', '>', '>='];

/** The tokens of an expression: { t: 'op' | 'num' | 'str' | 'word', v, at }. Throws on a stray character. */
function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const op = OPS.find((o) => text.startsWith(o, i));
    if (op) {
      tokens.push({ t: 'op', v: op, at: i });
      i += op.length;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = text.indexOf(c, i + 1);
      if (end === -1) throw new Error(`a text that starts at position ${i + 1} is not closed`);
      tokens.push({ t: 'str', v: text.slice(i + 1, end), at: i });
      i = end + 1;
      continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(text.slice(i));
    if (num) {
      tokens.push({ t: 'num', v: Number(num[0]), at: i });
      i += num[0].length;
      continue;
    }
    // a path: letters, digits, _ - . and [n]
    const word = /^[A-Za-z_][\w.-]*(\[\d+\][\w.-]*)*/.exec(text.slice(i));
    if (word) {
      tokens.push({ t: 'word', v: word[0], at: i });
      i += word[0].length;
      continue;
    }
    throw new Error(`unexpected "${c}" at position ${i + 1}`);
  }
  return tokens;
}

/** A path word as a reference: { widget: { merged: true } | { index } | { type }, attr }. */
function reference(word) {
  let m = /^widget\.([A-Za-z][\w]*)$/.exec(word);
  if (m) return { widget: { merged: true }, attr: m[1] };
  m = /^widgets\[(\d+)\]\.([A-Za-z][\w]*)$/.exec(word);
  if (m) return { widget: { index: Number(m[1]) }, attr: m[2] };
  m = /^widgets\.([a-z0-9][a-z0-9_-]*)\.([A-Za-z][\w]*)$/.exec(word);
  if (m) return { widget: { type: m[1] }, attr: m[2] };
  return null;
}

/**
 * Parses an expression into its tree: { lit } | { ref: { widget, attr } } | { op: '!', a } |
 * { op, a, b } for the binary operators. Throws an Error with a readable message.
 */
export function parseFilter(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('expected an expression, such as widget.update == false');
  const tokens = tokenize(text);
  let pos = 0;
  const peek = () => tokens[pos];
  const where = () => (peek() ? `at "${text.slice(peek().at, peek().at + 20)}"` : 'at the end');
  const isOp = (v) => peek()?.t === 'op' && peek().v === v;

  const primary = () => {
    const tok = peek();
    if (!tok) throw new Error('the expression ends too early');
    if (isOp('(')) {
      pos++;
      const inner = or();
      if (!isOp(')')) throw new Error(`expected ")" ${where()}`);
      pos++;
      return inner;
    }
    if (tok.t === 'num' || tok.t === 'str') {
      pos++;
      return { lit: tok.v };
    }
    if (tok.t === 'word') {
      pos++;
      if (tok.v === 'true' || tok.v === 'false') return { lit: tok.v === 'true' };
      if (tok.v === 'null') return { lit: null };
      const ref = reference(tok.v);
      if (!ref) throw new Error(`"${tok.v}" is not a value: use widget.<attribute>, widgets[<n>].<attribute> or widgets.<type>.<attribute>`);
      return { ref };
    }
    throw new Error(`expected a value ${where()}`);
  };
  const comparison = () => {
    const a = primary();
    if (peek()?.t === 'op' && COMPARE.includes(peek().v)) {
      const op = tokens[pos++].v;
      return { op, a, b: primary() };
    }
    return a;
  };
  const not = () => {
    if (isOp('!')) {
      pos++;
      return { op: '!', a: not() };
    }
    return comparison();
  };
  const and = () => {
    let a = not();
    while (isOp('&&')) {
      pos++;
      a = { op: '&&', a, b: not() };
    }
    return a;
  };
  const or = () => {
    let a = and();
    while (isOp('||')) {
      pos++;
      a = { op: '||', a, b: and() };
    }
    return a;
  };

  const tree = or();
  if (pos < tokens.length) throw new Error(`expected an operator ${where()}`);
  return tree;
}

/** Every reference in a tree, in order. */
export function filterRefs(tree, out = []) {
  if (!tree || typeof tree !== 'object') return out;
  if (tree.ref) out.push(tree.ref);
  filterRefs(tree.a, out);
  filterRefs(tree.b, out);
  return out;
}

/**
 * The tree with every reference turned into the widget positions on the service to read, in
 * order (`{ indexes, attr }`: the first that has the attribute counts),
 * checked against its widgets: [{ type, id?, attributes }] (type as written, id the widget's own
 * when `type` is an alias, attributes from widget.yaml). Returns
 * { tree, errors, warnings } as messages.
 */
export function bindFilter(tree, widgets) {
  const errors = [];
  const warnings = [];
  const bind = (node) => {
    if (!node || typeof node !== 'object') return node;
    if (node.ref) {
      const { widget, attr } = node.ref;
      if (widget.merged) {
        // every widget that declares it; none: a warning, and all of them (a widget may not declare)
        const declaring = widgets.map((w, i) => (w.attributes && attr in w.attributes ? i : -1)).filter((i) => i >= 0);
        if (!widgets.length) {
          errors.push('the service has no widget to read attributes from');
          return { ref: { indexes: [], attr } };
        }
        if (!declaring.length) {
          const all = [...new Set(widgets.flatMap((w) => Object.keys(w.attributes ?? {})))];
          warnings.push(`no widget on this service publishes "${attr}"${all.length ? ` (they publish ${all.join(', ')})` : ' (they publish none)'}`);
        }
        return { ref: { indexes: declaring.length ? declaring : widgets.map((_, i) => i), attr } };
      }
      const index = widget.type !== undefined ? widgets.findIndex((w) => w.type === widget.type || w.id === widget.type) : widget.index;
      if (index < 0 || index >= widgets.length) {
        errors.push(widget.type !== undefined ? `no "${widget.type}" widget on this service` : `the service has no widget ${widget.index} (it has ${widgets.length}, counted from 0)`);
        return { ref: { indexes: [], attr } };
      }
      const declared = widgets[index].attributes;
      if (declared && !(attr in declared)) {
        const names = Object.keys(declared);
        warnings.push(`${widgets[index].type} has no attribute "${attr}"${names.length ? ` (it has ${names.join(', ')})` : ' (it publishes none)'}`);
      }
      return { ref: { indexes: [index], attr } };
    }
    const out = { ...node };
    if (node.a) out.a = bind(node.a);
    if (node.b) out.b = bind(node.b);
    return out;
  };
  return { tree: bind(tree), errors, warnings };
}

/**
 * Evaluates a bound tree; `value(index, attr)` gives a widget's attribute. A reference takes the
 * first of its widgets that has the attribute (not undefined); none: null.
 * Comparisons are strict; <, <=, >, >= only hold between two numbers. The page has the same
 * function (public/index.html, evalFilter); tests/frontend.test.mjs keeps them in step.
 */
export function evalFilter(tree, value) {
  const run = (n) => {
    if ('lit' in n) return n.lit;
    if (n.ref) {
      for (const i of n.ref.indexes) {
        const v = value(i, n.ref.attr);
        if (v !== undefined) return v;
      }
      return null;
    }
    if (n.op === '!') return !run(n.a);
    if (n.op === '&&') return Boolean(run(n.a)) && Boolean(run(n.b));
    if (n.op === '||') return Boolean(run(n.a)) || Boolean(run(n.b));
    const a = run(n.a);
    const b = run(n.b);
    if (n.op === '==') return a === b;
    if (n.op === '!=') return a !== b;
    if (typeof a !== 'number' || typeof b !== 'number') return false;
    return n.op === '<' ? a < b : n.op === '<=' ? a <= b : n.op === '>' ? a > b : a >= b;
  };
  return Boolean(run(tree));
}
