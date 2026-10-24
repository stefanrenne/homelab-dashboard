# Discovery

Services can come from Docker labels and Kubernetes Ingress annotations as well as from
`services.yaml`. Discovered services are merged into the groups. **YAML wins**: a discovered
service with the same group and name as one in `services.yaml` is skipped. Discovered cards carry
a small "auto" badge. Sources are polled every `discovery.interval` (default 30 s).

## Docker

List the server in `docker.yaml` (see configuration.md). Then label containers:

```yaml
labels:
  homelab.name: Grafana              # required
  homelab.group: Monitoring          # default "Docker"
  homelab.icon: grafana.svg
  homelab.href: http://grafana.lan
  homelab.description: Dashboards
  homelab.weight: "10"               # order within the group (low first)
  homelab.siteMonitor: http://grafana:3000/api/health   # otherwise: container state
  homelab.widget.type: custom-api
  homelab.widget.url: http://grafana:3000/api/health
  homelab.widget.mappings: '[{"field":"version","label":"Version"}]'   # JSON for lists and maps
  homelab.widget.headers.Authorization: "Bearer {{HD_VAR_GRAFANA}}"    # dots make nested maps
```

A discovered container always gets its Docker state as a status label, next to `siteMonitor`
or `ping` when those are set.

**Coming from homepage?** Containers labelled for homepage (`homepage.group` + `homepage.name`,
`homepage.widget.*`, ...) are discovered as they are, and `{{HOMEPAGE_VAR_*}}` in their
labels is filled in from the environment. `homelab.*` labels win when a container has both.

**Access.** Only `GET /containers/json` and `GET /containers/<name>/json|stats` are used.
Recommended: [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) with only
`CONTAINERS=1`, and `host: docker-proxy` in docker.yaml. A directly mounted socket
(`/var/run/docker.sock:/var/run/docker.sock:ro`) is usually `root:root 660`. The container runs
as `node`, so add the socket's group: `--group-add $(stat -c %g /var/run/docker.sock)`.
On Docker Desktop that group is `0`.

## Kubernetes

`kubernetes.yaml`: `mode: cluster`. The dashboard then uses its service account to list Ingresses
in all namespaces. RBAC:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata: { name: homelab-dashboard }
rules:
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses"]
    verbs: ["list"]
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
