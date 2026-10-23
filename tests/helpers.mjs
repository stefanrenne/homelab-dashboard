// Shared test helpers.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

export const silentLog = { info() {}, warn() {}, error() {} };

export function tmpDir(prefix = 'hd-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Writes a widget package; `files` maps file name to contents (objects become YAML-ish JSON). */
export function writeWidget(dir, manifest, files = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'widget.yaml'), JSON.stringify(manifest));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

/** Starts an HTTP server on a random port (or unix socket); returns { url, close }. */
export async function serve(handler, { socketPath } = {}) {
  const server = http.createServer(handler);
  await new Promise((resolve) => (socketPath ? server.listen(socketPath, resolve) : server.listen(0, '127.0.0.1', resolve)));
  const url = socketPath ? null : `http://127.0.0.1:${server.address().port}`;
  return { url, server, close: () => new Promise((r) => server.close(r)) };
}

/** A minimal ctx for calling a widget's fetch() directly in tests. */
export function fakeCtx(options, overrides = {}) {
  return {
    apiVersion: 1,
    instanceId: 'test',
    options,
    signal: new AbortController().signal,
    cache: new Map(),
    log: silentLog,
    fetch: (input, init) => fetch(input, init),
    ...overrides,
  };
}
