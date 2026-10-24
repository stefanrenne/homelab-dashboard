# Discovery

Services can come from Docker labels and Kubernetes Ingress annotations as well as from
`services.yaml`. Discovered services are merged into the groups. **YAML wins**: a discovered
service with the same group and name as one in `services.yaml` is skipped. Discovered cards carry
a small "auto" badge. Sources are polled every `discovery.interval` (default 30 s).

## Docker

Mount the Docker socket, or list a server in `docker.yaml` (see configuration.md):

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
[docker.yaml](configuration.md#dockeryaml) for names, several hosts and `discover: false`. The container starts as root only to give its `node` user the socket's group,
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
labels:
  homelab.widgets[0].type: emby
  homelab.widgets[0].url: http://emby.lan
  homelab.widgets[1].type: custom-api
  homelab.widgets[1].url: http://argus.lan/api/v1/service/summary/emby
  homelab.widgets[1].mappings[0].label: Deployed version
  homelab.widgets[1].mappings[0].field.status: deployed_version
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

## Kubernetes

`kubernetes.yaml`: `mode: cluster` in the cluster, or `mode: default` outside it (as in homepage).
With `mode: cluster` the dashboard uses its service account to list Ingresses in all namespaces;
with `mode: default` it reads a kubeconfig instead: `kubeconfig:` (a path relative to the config
folder), else `$KUBECONFIG`, else `~/.kube/config`, with its current context or `context:`.

```yaml
# kubernetes.yaml, the dashboard in Docker next to a cluster
mode: default
kubeconfig: kube/config   # /config/kube/config in the container
context: home             # optional: another context than the current one
```

A kubeconfig may hold a token (`token`, `tokenFile`), a client certificate (`client-certificate`
/ `client-key`, or their `-data` forms) or a user name and password. Credential plugins (`exec`,
as for EKS, GKE and AKS) are not run: make a service account token for the dashboard instead
(`kubectl create token homelab-dashboard --duration=8760h`) and put it in the kubeconfig. Give
that account the RBAC below.

In the cluster: The image starts as root and drops to `node` itself; with
`runAsNonRoot: true` in the pod's security context, also set `runAsUser: 1000`. RBAC:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata: { name: homelab-dashboard }
rules:
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses"]
    verbs: ["list"]
  # only with traefik: true
  - apiGroups: ["traefik.io", "traefik.containo.us"]
    resources: ["ingressroutes"]
    verbs: ["list"]
  # only with gateway: true
  - apiGroups: ["gateway.networking.k8s.io"]
    resources: ["httproutes", "gateways"]
    verbs: ["list", "get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata: { name: homelab-dashboard }
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: ClusterRole, name: homelab-dashboard }
subjects: [{ kind: ServiceAccount, name: homelab-dashboard, namespace: homelab }]
```

Annotate Ingresses:

```yaml
metadata:
  annotations:
    homelab.dev/enabled: "true"      # required
    homelab.dev/name: Grafana        # default: the Ingress name
    homelab.dev/group: Monitoring    # default: the namespace
    homelab.dev/icon: grafana.svg
    homelab.dev/href: https://grafana.example.com   # default: first rule host + path (https with TLS)
    homelab.dev/widget.type: http-status
    homelab.dev/widget.url: http://grafana.monitoring:3000/api/health
```

homepage's `gethomepage.dev/*` annotations work as well.

**Traefik and the Gateway API**, as in homepage: Ingresses are listed by default; add
`traefik: true` for Traefik's IngressRoutes (`traefik.io` and the older `traefik.containo.us`)
and `gateway: true` for Gateway API HTTPRoutes to kubernetes.yaml, `ingress: false` to skip
Ingresses. They take the same annotations. Without `href`, an IngressRoute links to the host
and path of its first `Host(...)` match (https with `tls`), and an HTTPRoute to its first
hostname and path, https when its Gateway's listener is HTTPS. A kind that is not installed is
skipped.

```yaml
# kubernetes.yaml
mode: cluster
traefik: true
gateway: true
```
