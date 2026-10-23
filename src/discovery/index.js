// Polls the discovery sources and merges what they find into the YAML services.

import { discoverDocker } from './docker.js';
import { discoverKubernetes } from './kubernetes.js';
import { normalizeService } from '../config/load.js';
import { parseDuration } from '../util.js';

export class Discovery {
  constructor({ log = console, onChange = () => {}, docker = discoverDocker, kubernetes = discoverKubernetes } = {}) {
    this.log = log;
    this.onChange = onChange;
    this.sources = { docker, kubernetes };
    this.found = [];
    this.errors = [];
    this.timer = null;
    this.signature = '';
  }

  /** (Re)configures from the loaded config and runs a first poll. */
  async configure(config) {
    this.stop();
    this.config = config;
    this.intervalMs = parseDuration(config.settings.discovery?.interval, 30_000);
    await this.poll();
    if (this.#enabled()) this.timer = setInterval(() => this.poll().catch(() => {}), this.intervalMs).unref();
  }

  #enabled() {
    return this.config.docker.some((s) => s.discover) || this.config.kubernetes.mode === 'cluster';
  }

  async poll() {
    const found = [];
    const errors = [];
    for (const server of this.config.docker.filter((s) => s.discover)) {
      try {
        found.push(...(await this.sources.docker(server)).map((s) => ({ ...s, origin: `docker:${server.name}` })));
      } catch (err) {
        errors.push({ file: 'docker.yaml', path: server.name, message: `discovery: ${err.message}` });
      }
    }
    if (this.config.kubernetes.mode === 'cluster') {
      try {
        found.push(...(await this.sources.kubernetes()).map((s) => ({ ...s, origin: 'kubernetes' })));
      } catch (err) {
        errors.push({ file: 'kubernetes.yaml', path: 'mode', message: `discovery: ${err.message}` });
      }
    }
    this.found = found;
    this.errors = errors;
    const signature = JSON.stringify([found, errors]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.onChange();
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}

/**
 * Merges discovered services into the YAML groups. YAML wins: a discovered service with
 * the same group and name as a YAML service is skipped. Returns { groups, warnings }.
 */
export function mergeDiscovered(yamlGroups, found) {
  const groups = yamlGroups.map((g) => ({ ...g, services: [...g.services] }));
  const warnings = [];
  const ctx = { error: (file, p, message) => warnings.push({ file, path: p, message }), warn: () => {} };
  const sorted = [...found].sort((a, b) => a.weight - b.weight || a.name.localeCompare(b.name));
  for (const svc of sorted) {
    let group = groups.find((g) => g.name === svc.group);
    if (!group) {
      group = { name: svc.group, services: [] };
      groups.push(group);
    }
    if (group.services.some((s) => s.name === svc.name)) continue;
    const service = normalizeService(svc.name, svc.def, svc.origin, svc.name, ctx);
    if (service) group.services.push({ ...service, discovered: svc.origin });
  }
  return { groups, warnings };
}
