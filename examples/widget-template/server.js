// Server part: runs inside the dashboard, never in the browser, so it may use secrets.
// It must be self-contained: import only node: built-ins (bundle anything else).

export default {
  /**
   * Called at most once per `refresh` per widget instance.
   * @param {object} ctx
   * @param {object} ctx.options   validated options (secrets included)
   * @param {Function} ctx.fetch   fetch(); relative URLs resolve against options.url
   * @param {Map} ctx.cache        survives between calls of this instance
   * @param {AbortSignal} ctx.signal  aborted when the call times out
   * @param {object} ctx.log       info / warn / error
   */
  async fetch(ctx) {
    const headers = ctx.options.key ? { authorization: `Bearer ${ctx.options.key}` } : {};
    const res = await ctx.fetch('stats.json', { headers });
    // "answered <status>" is turned into advice on the card (check the key, the URL, ...)
    if (!res.ok) throw new Error(`the API answered ${res.status}`);

    const json = await res.json();
    const value = Number(json[ctx.options.field]);
    if (!Number.isFinite(value)) throw new Error(`no number in field "${ctx.options.field}"`);
    const previous = ctx.cache.get('previous');
    ctx.cache.set('previous', value);

    return {
      // `blocks` is enough for the standard look; client.js is optional.
      // Labels are keys in i18n.json; `key` lets users pick blocks with `fields:`.
      blocks: [
        { key: 'value', label: 'value', value },
        { key: 'change', label: 'change', value: previous === undefined ? null : value - previous },
      ],
      // Anything else is free-form data for client.js.
      value,
      max: ctx.options.max,
    };
  },

  /**
   * Optional: runs when client.js sends `hd-widget-action` (a button press). One at a time per
   * instance; the dashboard shows the result in a dialog (`output` as text, `exitCode` if any).
   * Same ctx as fetch, plus ctx.configDir (the dashboard's config folder).
   */
  async action(ctx) {
    ctx.cache.delete('previous');
    return { status: 'ok', output: 'The change starts again from the next value.' };
  },
};
