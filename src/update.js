// The update check next to the version in the footer: once a day the newest GitHub release, so
// the footer can say when a newer version is out. Off with hideVersion: true or
// disableUpdateCheck, and without a url (tests). A failed check is logged and tried again the next day.

export const RELEASES_URL = 'https://api.github.com/repos/stefanrenne/homelab-dashboard/releases/latest';
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

const parts = (v) => (/^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v)) ?? []).slice(1).map(Number);

/** Whether release `candidate` (v1.2.3 or 1.2.3) is newer than `current`; false for non-releases. */
export function isNewer(candidate, current) {
  const a = parts(candidate);
  const b = parts(current);
  if (a.length !== 3 || b.length !== 3) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export class UpdateCheck {
  constructor({ url = RELEASES_URL, everyMs = CHECK_EVERY_MS, fetchImpl = fetch, log = console, onChange = () => {} } = {}) {
    Object.assign(this, { url, everyMs, fetchImpl, log, onChange });
    this.latest = null; // { version, url }
    this.timer = null;
  }

  /** Starts (or keeps) the daily check; the first one runs right away. */
  start() {
    if (this.timer || !this.url) return;
    this.timer = setInterval(() => this.check(), this.everyMs);
    this.timer.unref?.();
    return this.check();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  async check() {
    try {
      const res = await this.fetchImpl(this.url, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'homelab-dashboard' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const release = await res.json();
      const latest = { version: String(release.tag_name ?? '').replace(/^v/, ''), url: String(release.html_url ?? '') };
      const changed = latest.version !== this.latest?.version;
      this.latest = latest;
      if (changed) this.onChange(latest);
    } catch (err) {
      this.log.info(`update check: ${err.message}`);
    }
  }
}
