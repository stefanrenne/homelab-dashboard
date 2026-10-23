// Watches the config directory and calls `onChange` (debounced) when a YAML file changes.

import fs from 'node:fs';

export function watchConfig(dir, onChange, { debounceMs = 300, log = console } = {}) {
  let timer = null;
  let watcher;
  try {
    watcher = fs.watch(dir, (event, filename) => {
      if (filename && !/\.ya?ml$/.test(filename)) return;
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
