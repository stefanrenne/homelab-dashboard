// Polls the discovery sources and merges what they find into the YAML services.

import { discoverDocker } from './docker.js';
import { discoverKubernetes } from './kubernetes.js';
import { normalizeService } from '../config/load.js';
import { substitute } from '../config/vars.js';
import { parseDuration } from '../util.js';

export class Discovery {
  constructor({ log = console, onChange = () => {}, docker = discoverDocker, kubernetes = discoverKubernetes, env = process.env } = {}) {
    this.log = log;
    this.env = env;
    this.secrets = new Set();
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
        const withInstance = { ...server, instanceName: this.config.settings?.instanceName ?? null };
        found.push(...(await this.sources.docker(withInstance)).map((s) => ({ ...s, origin: `docker:${server.name}` })));
      } catch (err) {
        errors.push({ file: 'docker.yaml', path: server.implicit ? `${server.name} (the mounted ${server.socket})` : server.name, message: `discovery: ${err.message}` });
      }
    }
    if (this.config.kubernetes.mode === 'cluster') {
      try {
        found.push(...(await this.sources.kubernetes({ instanceName: this.config.settings?.instanceName ?? null })).map((s) => ({ ...s, origin: 'kubernetes' })));
      } catch (err) {
        errors.push({ file: 'kubernetes.yaml', path: 'mode', message: `discovery: ${err.message}` });
      }
    }
    // Labels may use {{HD_VAR_*}} / {{HOMEPAGE_VAR_*}} too; those values are secrets (hard rule 1).
    const secrets = new Set();
    for (const svc of found) {
      const sub = substitute(svc.def, { env: this.env });
      svc.def = sub.value;
      for (const s of sub.secrets) secrets.add(s);
    }
    this.found = found;
    this.errors = errors;
    this.secrets = secrets;
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
  const groups = yamlGroups.map((g) => ({ ...g, services: [...g.services], groups: g.groups ?? [] }));
  const warnings = [];
  const ctx = { error: (file, p, message) => warnings.push({ file, path: p, message }), warn: () => {} };
  const sorted = [...found].sort((a, b) => a.weight - b.weight || a.name.localeCompare(b.name));
  for (const svc of sorted) {
    let group = groups.find((g) => g.name === svc.group);
    if (!group) {
      group = { name: svc.group, services: [], groups: [] };
      groups.push(group);
    }
    if (group.services.some((s) => s.name === svc.name)) continue;
    const service = normalizeService(svc.name, svc.def, svc.origin, svc.name, ctx);
    if (service) group.services.push({ ...service, discovered: svc.origin });
  }
  return { groups, warnings };
}
