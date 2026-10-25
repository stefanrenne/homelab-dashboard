// Installed widgets' server.js runs in one worker thread with a memory limit, not in the
// dashboard's own event loop: a widget that loops forever or eats memory stops the worker, not
// the dashboard (hard rule 4). A call that does not end within a second after its timeout gets
// the worker restarted; the widgets in it lose their ctx.cache, nothing else. Built-in widgets
// run in the dashboard process. HD_WIDGET_ISOLATION=off runs installed widgets there too.

import { Worker } from 'node:worker_threads';

export const WORKER_FILE = new URL('./worker.js', import.meta.url);
export const DEFAULT_MEMORY_MB = 256;
export const GRACE_MS = 1000;

export class WidgetSandbox {
  #worker = null;
  #calls = new Map(); // id -> { resolve, reject, log, timer }
  #seq = 0;

  constructor({ log = console, memoryMb = DEFAULT_MEMORY_MB, graceMs = GRACE_MS, file = WORKER_FILE } = {}) {
    this.log = log;
    this.memoryMb = memoryMb;
    this.graceMs = graceMs;
    this.file = file;
    this.restarts = 0;
  }

  #spawn() {
    const worker = new Worker(this.file, { resourceLimits: { maxOldGenerationSizeMb: this.memoryMb } });
    worker.unref();
    worker.on('message', (m) => {
      const call = this.#calls.get(m.id);
      if (m.type === 'log') return call?.log[m.level]?.(m.text);
      if (!call) return undefined;
      this.#settle(m.id);
      if (m.type === 'result') call.resolve(m.data);
      else call.reject(new Error(m.error));
      return undefined;
    });
    const gone = (why) => {
      if (this.#worker !== worker) return;
      this.#worker = null;
      for (const id of [...this.#calls.keys()]) {
        const call = this.#calls.get(id);
        this.#settle(id);
        call.reject(new Error(`the widget worker stopped (${why})`));
      }
    };
    worker.on('error', (err) => {
      this.log.warn(`widget worker: ${err.message}`);
      gone(err.code === 'ERR_WORKER_OUT_OF_MEMORY' ? `out of memory, the limit is ${this.memoryMb} MB` : err.message);
    });
    worker.on('exit', (code) => gone(`exit ${code}`));
    return worker;
  }

  #settle(id) {
    clearTimeout(this.#calls.get(id)?.timer);
    this.#calls.delete(id);
  }

  /** Runs a widget's fetch (or `kind: 'action'`, its action) in the worker; resolves its data or rejects with its error. */
  run({ url, instanceId, options, params = {}, kind = 'fetch', configDir = null, signal, log }) {
    this.#worker ??= this.#spawn();
    const worker = this.#worker;
    const id = ++this.#seq;
    return new Promise((resolve, reject) => {
      this.#calls.set(id, { resolve, reject, log });
      const onAbort = () => {
        if (!this.#calls.has(id)) return;
        worker.postMessage({ type: 'abort', id, reason: signal.reason?.message ?? 'aborted' });
        // still busy after the grace time: stuck in a loop, so the worker goes
        this.#calls.get(id).timer = setTimeout(() => {
          if (!this.#calls.has(id)) return;
          this.log.warn(`widget worker: a widget did not stop after its timeout; restarting the worker`);
          this.restart('a widget did not stop after its timeout');
        }, this.graceMs);
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
      try {
        worker.postMessage({ type: 'run', id, url, instanceId, options, params, kind, configDir });
      } catch (err) {
        this.#settle(id);
        reject(new Error(`options cannot reach the widget worker (${err.message})`));
      }
    });
  }

  /** Drops ctx.cache stores of instances that no longer exist. */
  keep(ids) {
    this.#worker?.postMessage({ type: 'keep', ids: [...ids] });
  }

  restart(reason = 'restarted') {
    const worker = this.#worker;
    if (!worker) return;
    this.restarts++;
    for (const id of [...this.#calls.keys()]) {
      const call = this.#calls.get(id);
      this.#settle(id);
      call.reject(new Error(`the widget worker was restarted: ${reason}`));
    }
    this.#worker = null;
    worker.terminate();
  }

  close() {
    this.restart('closing');
  }
}
