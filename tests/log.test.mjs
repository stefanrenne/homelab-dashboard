// The log (src/log.js): stdout, and a rotated file with settings.logpath.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createLogger, LOG_FILE } from '../src/log.js';
import { tmpDir } from './helpers.mjs';

const capture = () => {
  const lines = [];
  return { lines, out: { log: (l) => lines.push(l), warn: (l) => lines.push(l), error: (l) => lines.push(l) } };
};
const at = () => new Date('2026-10-24T12:00:00Z');

test('without logpath only stdout; with it both, in <logpath>/logs', () => {
  const { lines, out } = capture();
  const log = createLogger({ out, now: at });
  log.info('one', 2);
  assert.deepEqual(lines, ['2026-10-24T12:00:00.000Z INFO one 2']);
  const dir = tmpDir('hd-log-');
  log.setLogPath(dir);
  log.warn('two');
  assert.equal(lines.at(-1), '2026-10-24T12:00:00.000Z WARN two');
  assert.equal(fs.readFileSync(path.join(dir, 'logs', LOG_FILE), 'utf8'), '2026-10-24T12:00:00.000Z WARN two\n');
});

test('LOG_TARGETS file writes only the file; an unknown value warns and uses the default', () => {
  const { lines, out } = capture();
  const dir = tmpDir('hd-log-');
  const log = createLogger({ targets: 'file', out, now: at });
  log.setLogPath(dir);
  log.error(new Error('boom'));
  assert.deepEqual(lines, []);
  assert.match(fs.readFileSync(path.join(dir, 'logs', LOG_FILE), 'utf8'), /ERROR Error: boom/);
  const odd = capture();
  createLogger({ targets: 'syslog', out: odd.out, now: at });
  assert.match(odd.lines[0], /LOG_TARGETS "syslog"/);
});

test('the file rotates at the size limit and keeps five files', () => {
  const { out } = capture();
  const dir = tmpDir('hd-log-');
  const log = createLogger({ out, now: at, maxBytes: 40 });
  log.setLogPath(dir);
  for (let i = 0; i < 20; i++) log.info(`line ${i}`);
  const files = fs.readdirSync(path.join(dir, 'logs')).sort();
  assert.deepEqual(files, ['homelab-dashboard.log', 'homelab-dashboard1.log', 'homelab-dashboard2.log', 'homelab-dashboard3.log', 'homelab-dashboard4.log']);
  assert.match(fs.readFileSync(path.join(dir, 'logs', 'homelab-dashboard.log'), 'utf8'), /line 19/);
  assert.ok(!fs.readFileSync(path.join(dir, 'logs', 'homelab-dashboard4.log'), 'utf8').includes('line 0'), 'the oldest lines are gone');
});

test('a log folder that cannot be made falls back to stdout with a warning', () => {
  const { lines, out } = capture();
  const parent = tmpDir('hd-log-');
  fs.writeFileSync(path.join(parent, 'logs'), 'a file in the way');
  const log = createLogger({ out, now: at });
  log.setLogPath(parent);
  assert.match(lines[0], /WARN log folder .*logs: (EEXIST|ENOTDIR)/);
  assert.equal(log.file, null);
  log.info('still here');
  assert.equal(lines.at(-1), '2026-10-24T12:00:00.000Z INFO still here');
});
