// Watches the config directory and calls `onChange` (debounced) when a YAML file changes,
// also in subfolders (for files pulled in with !include). plugins/ is skipped: the dashboard
// writes plugins.lock.yaml there itself. On network file systems (NFS, SMB) fs.watch sees no
// changes made elsewhere; `pollMs` (HD_WATCH_POLL) compares the files' size and time instead.
// When fs.watch cannot start at all, polling every 5 seconds takes over.

import fs from 'node:fs';
import { PLUGINS_DIR } from '../plugins/installer.js';

/** Whether a change to `filename` (relative to the config dir) should reload the config. */
export function isConfigChange(filename) {
  if (!filename) return true;
  const parts = String(filename).split(/[\\/]/);
  return /\.ya?ml$/.test(parts.at(-1)) && parts[0] !== PLUGINS_DIR;
}

export const FALLBACK_POLL_MS = 5000;

/** "path size mtime" of every YAML file under `dir` (plugins/ left out), as one string. */
export function snapshot(dir, rel = '') {
  let entries;
  try {
    entries = fs.readdirSync(rel ? `${dir}/${rel}` : dir, { withFileTypes: true });
  } catch {
    return '';
  }
  const out = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!rel && e.name === PLUGINS_DIR) continue;
      out.push(snapshot(dir, name));
    } else if (isConfigChange(name)) {
      try {
        const st = fs.statSync(`${dir}/${name}`);
        out.push(`${name} ${st.size} ${st.mtimeMs}`);
      } catch { /* removed meanwhile */ }
    }
  }
  return out.filter(Boolean).join('\n');
}

function poll(dir, onChange, ms) {
  let last = snapshot(dir);
  const timer = setInterval(() => {
    const now = snapshot(dir);
    if (now !== last) {
      last = now;
      onChange();
    }
  }, ms);
  timer.unref?.();
  return { close: () => clearInterval(timer) };
}

export function watchConfig(dir, onChange, { debounceMs = 300, pollMs = 0, log = console } = {}) {
  if (pollMs > 0) return poll(dir, onChange, pollMs);
  let timer = null;
  let watcher;
  try {
    watcher = fs.watch(dir, { recursive: true }, (event, filename) => {
      if (!isConfigChange(filename)) return;
      clearTimeout(timer);
      timer = setTimeout(onChange, debounceMs);
    });
  } catch (err) {
    log.warn(`config: cannot watch ${dir} (${err.code || err.message}); checking for changes every ${FALLBACK_POLL_MS / 1000} s instead`);
    return poll(dir, onChange, FALLBACK_POLL_MS);
  }
  watcher.on('error', (err) => log.warn(`config: watcher stopped (${err.message})`));
  return {
    close() {
      clearTimeout(timer);
      watcher.close();
    },
  };
}
