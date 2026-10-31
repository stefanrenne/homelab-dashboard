# Docker

`docker.yaml` lists the Docker servers: for `container:` status labels on a service, and to
[discover](#discovery) services from container labels.

## Servers

The Docker servers, for `container:` status labels and for [discovery](#discovery) of
labelled containers. Each top-level key is a name you choose (`local`, `green`, `nas`, ...):

```yaml
green:
  socket: /var/run/docker.sock   # the socket as mounted in the dashboard's container
nas:
  host: 192.168.1.20             # a Docker API or docker-socket-proxy
  port: 2375
  protocol: http
  discover: false                # only for container status, do not add its containers
remote:
  host: docker.example.lan       # the Docker daemon over TLS (dockerd --tlsverify, port 2376)
  port: 2376
  tls:                           # homepage's keys; paths relative to the config folder
    caFile: tls/ca.pem
    certFile: tls/cert.pem
    keyFile: tls/key.pem
```

| Key | Default | What |
|---|---|---|
| `socket` | | Path of a Docker socket inside the container. Mount it: `/var/run/docker.sock:/var/run/docker.sock:ro` |
| `host` | | Host name or IP of a Docker API or socket proxy (instead of `socket`) |
| `port` | `2375` | Port of that API |
| `protocol` | `http` | `http` or `https` (`https` when `tls` is set) |
| `tls` | | `caFile` (the CA that signed the daemon's certificate), `certFile` and `keyFile` (the client certificate, together). Read when the config loads; their contents stay on the server |
| `discover` | `true` | `false`: use the server for `container:` status only, without adding its containers |
| `swarm` | `false` | `true`: a Docker Swarm manager; discovery lists its services, and `container:` also finds a service by name (see [Docker Swarm](#docker-swarm)) |

The name is what `server:` refers to in `services.yaml`, and what config messages show.

- **No servers here** (no file, or only comments): a socket mounted at `/var/run/docker.sock`
  is used as the server `local` by itself. For a single Docker host on the same machine,
  mounting the socket is all it takes.
- **One or more servers here**: only those are used. To use the mounted socket next to another
  server, list it too, as `green` above.
- **One server**: services with `container:` use it; `server:` is optional.
  **Several servers**: give such services `server: <name>`. Discovered containers always
  carry the server they were found on.

## Discovery

Services can come from Docker labels and Kubernetes Ingress annotations as well as from
`services.yaml`. Discovered services are merged into the groups. **YAML wins**: a discovered
service with the same group and name as one in `services.yaml` is skipped. Discovered cards carry
a small "auto" badge. Sources are polled every `discovery.interval` (default 30 s).

Mount the Docker socket, or list a server in `docker.yaml` (see [Servers](#servers)):

```yaml
# compose.yaml, the simplest form
services:
  dashboard:
    image: ghcr.io/stefanrenne/homelab-dashboard:latest
    volumes:
      - ./config:/config
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

When `docker.yaml` lists no servers, a socket mounted at `/var/run/docker.sock` is used as the
server `local`. Once it lists a server, only the listed ones are used; see
[Servers](#servers) for names, several hosts and `discover: false`. The container starts as root only to give its `node` user the socket's group,
then runs the dashboard as `node`; no `--group-add` needed.

Then label containers:

```yaml
labels:
  homelab.name: Grafana              # required
  homelab.group: Monitoring          # default "Docker"
  homelab.icon: grafana.svg
  homelab.href: http://grafana.lan
  homelab.description: Dashboards
  homelab.weight: "10"               # order within the group, low first (default 0; services.yaml ones weigh 100, 200, ...)
  homelab.siteMonitor: http://grafana:3000/api/health   # otherwise: container state
  homelab.widget.type: custom-api
  homelab.widget.url: http://grafana:3000/api/health
  homelab.widget.mappings: '[{"field":"version","label":"Version"}]'   # JSON for lists and maps
  homelab.widget.headers.Authorization: "Bearer {{HD_VAR_GRAFANA}}"    # dots make nested maps
  homelab.statusStyle: dot           # also target, showStats
```

Several widgets and lists use homepage's index notation:

```yaml
labels:                          # Compose's list form: the same labels
  - homelab.widgets[0].type=emby
  - homelab.widgets[0].url=http://emby.lan
  - homelab.widgets[1].type=custom-api
  - homelab.widgets[1].url=http://argus.lan/api/v1/service/summary/emby
  - homelab.widgets[1].mappings[0].label=Deployed version
  - homelab.widgets[1].mappings[0].field.status=deployed_version
```

**Several dashboards on one Docker host**: give each an `instanceName` in settings.yaml. A label
with `instance.<name>.` after the prefix applies to that dashboard only and wins over the plain
label; the other dashboards ignore it.

```yaml
labels:
  homelab.name: Emby
  homelab.instance.internal.href: http://emby.lan
  homelab.instance.public.href: https://emby.example.com
```

A discovered container always gets its Docker state as a status label, next to `siteMonitor`
or `ping` when those are set.

**Coming from homepage?** Containers labelled for homepage (`homepage.group` + `homepage.name`,
`homepage.widget.*`, ...) are discovered as they are, and `{{HOMEPAGE_VAR_*}}` in their
labels is filled in from the environment. `homelab.*` labels win when a container has both.

**Access.** The dashboard only calls `GET /containers/json` and `GET /containers/<name>/json|stats`
(with `swarm: true` also `GET /services` and `/tasks`).
But `:ro` on a socket does not make the Docker API read-only: whoever can reach the socket can
start and remove containers, which amounts to root on the host. Third-party widgets run inside
the dashboard process, so they could reach it too. The safer setup is a
[docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) with only
`CONTAINERS=1`, and `host: docker-proxy` in docker.yaml (see `docker-compose.example.yml`).

A container started with `--user` (or Kubernetes `runAsUser`) skips the group step; give it the
socket's group yourself then: `--group-add $(stat -c %g /var/run/docker.sock)`.

### Docker Swarm

Give the server `swarm: true` in docker.yaml, as in homepage. Discovery then lists the Swarm's
services instead of containers, so put the labels on the service (`deploy.labels` in a stack
file), not on the container. Run the dashboard on a manager node (`node.role == manager`):
only managers can list services.

```yaml
# stack.yaml, deployed with docker stack deploy -c stack.yaml media
services:
  jellyfin:
    image: jellyfin/jellyfin
    deploy:
      labels:
        homelab.name: Jellyfin
        homelab.group: Media
        homelab.href: http://jellyfin.lan
```

A service of a stack is named `<stack>_<service>` (`media_jellyfin`); that is its `container:`
in services.yaml too. Its status label shows the running tasks against the replicas: `running`,
`partial` (marked) or down, and CPU and memory when a running task is on the dashboard's node.
A container of that name still wins. With a socket proxy, also allow `SERVICES=1` and `TASKS=1`.
