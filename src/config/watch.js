// Watches the config directory and calls `onChange` (debounced) when a YAML file changes,
// also in subfolders (for files pulled in with !include). plugins/ is skipped: the dashboard
// writes plugins.lock.yaml there itself.

import fs from 'node:fs';
import { PLUGINS_DIR } from '../plugins/installer.js';

/** Whether a change to `filename` (relative to the config dir) should reload the config. */
export function isConfigChange(filename) {
  if (!filename) return true;
  const parts = String(filename).split(/[\\/]/);
  return /\.ya?ml$/.test(parts.at(-1)) && parts[0] !== PLUGINS_DIR;
}

export function watchConfig(dir, onChange, { debounceMs = 300, log = console } = {}) {
  let timer = null;
  let watcher;
  try {
    watcher = fs.watch(dir, { recursive: true }, (event, filename) => {
      if (!isConfigChange(filename)) return;
      clearTimeout(timer);
      timer = setTimeout(onChange, debounceMs);
    });
  } catch (err) {
    log.warn(`config: cannot watch ${dir} (${err.code || err.message}); changes need a restart`);
    return { close() {} };
  }
  watcher.on('error', (err) => log.warn(`config: watcher stopped (${err.message})`));
  return {
    close() {
      clearTimeout(timer);
      watcher.close();
    },
  };
}
