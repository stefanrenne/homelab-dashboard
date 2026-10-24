#!/usr/bin/env node
// Entry point: `node src/server.js [--config <dir>] [--port <n>] [--host <addr>]`.
// Environment: HD_CONFIG_DIR, PORT, HOST, LOG_TARGETS (both, stdout or file; see src/log.js).

import http from 'node:http';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createApp, VERSION } from './app.js';
import { createLogger } from './log.js';

const { values } = parseArgs({
  options: {
    config: { type: 'string', default: process.env.HD_CONFIG_DIR ?? '/config' },
    port: { type: 'string', default: process.env.PORT ?? '3000' },
    host: { type: 'string', default: process.env.HOST ?? '0.0.0.0' },
  },
});

const configDir = path.resolve(values.config);
const log = createLogger(); // stdout, and a file when settings.yaml has logpath

const app = await createApp({ configDir, log, watch: true });
const server = http.createServer(app.handler);
server.listen(Number(values.port), values.host, () => {
  log.info(`homelab-dashboard ${VERSION} on http://${values.host}:${values.port} (config: ${configDir})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    app.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
