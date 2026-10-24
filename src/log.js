// The dashboard's log: stdout, and with settings.logpath also a file (homepage's logpath).
//
// LOG_TARGETS picks where lines go: both, stdout or file. Without logpath only stdout is
// written (hard rule 5: a file is only written where the user asked for one); with logpath the
// default is both. The file is <logpath>/logs/homelab-dashboard.log and rotates at 10 MiB,
// keeping five files (homelab-dashboard.log and homelab-dashboard1.log … 4.log).

import fs from 'node:fs';
import path from 'node:path';

export const LOG_FILE = 'homelab-dashboard.log';
export const MAX_LOG_BYTES = 10 * 1024 * 1024;
export const ROTATED_FILES = 4;
const TARGETS = ['both', 'stdout', 'file'];

export function createLogger({ targets = process.env.LOG_TARGETS, out = console, now = () => new Date(), maxBytes = MAX_LOG_BYTES } = {}) {
  let file = null;
  const wanted = TARGETS.includes(targets) ? targets : null;
  if (targets && !wanted) out.warn(`${now().toISOString()} WARN LOG_TARGETS "${targets}" is not both, stdout or file; using the default`);

  const rotate = () => {
    for (let i = ROTATED_FILES - 1; i >= 1; i--) {
      const from = file.replace(/\.log$/, `${i}.log`);
      if (fs.existsSync(from)) fs.renameSync(from, file.replace(/\.log$/, `${i + 1}.log`));
    }
    fs.renameSync(file, file.replace(/\.log$/, '1.log'));
  };

  const write = (level, method, args) => {
    const line = `${now().toISOString()} ${level} ${args.map((a) => (typeof a === 'string' ? a : String(a?.stack ?? a))).join(' ')}`;
    const target = wanted ?? (file ? 'both' : 'stdout');
    if (target !== 'file' || !file) out[method](line);
    if (target !== 'stdout' && file) {
      try {
        if (fs.existsSync(file) && fs.statSync(file).size >= maxBytes) rotate();
        fs.appendFileSync(file, line + '\n');
      } catch (err) {
        out.warn(`${now().toISOString()} WARN log file ${file}: ${err.code || err.message}; logging to stdout only`);
        file = null;
      }
    }
  };

  return {
    info: (...args) => write('INFO', 'log', args),
    warn: (...args) => write('WARN', 'warn', args),
    error: (...args) => write('ERROR', 'error', args),
    /** Where the log file goes (settings.logpath, resolved), or null for none. */
    setLogPath(dir) {
      const next = dir ? path.join(dir, 'logs', LOG_FILE) : null;
      if (next === file) return;
      if (next) {
        try {
          fs.mkdirSync(path.dirname(next), { recursive: true });
        } catch (err) {
          out.warn(`${now().toISOString()} WARN log folder ${path.dirname(next)}: ${err.code || err.message}; logging to stdout only`);
          file = null;
          return;
        }
      }
      file = next;
    },
    get file() {
      return file;
    },
  };
}
