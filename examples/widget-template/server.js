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
    if (!res.ok) throw new Error(`the API answered ${res.status}`); // shown on the card

    const json = await res.json();
    const value = Number(json[ctx.options.field]);
    const previous = ctx.cache.get('previous');
    ctx.cache.set('previous', value);

    return {
      // `blocks` is enough for the standard look; client.js below is optional.
      blocks: [
        { label: 'value', value },
        { label: 'change', value: previous === undefined ? null : value - previous },
      ],
      // Anything else is free-form data for client.js.
      value,
      max: ctx.options.max,
    };
  },
};
