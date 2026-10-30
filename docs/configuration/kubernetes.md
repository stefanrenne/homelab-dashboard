# Kubernetes

`kubernetes.yaml` connects the dashboard to a cluster: to [discover](#discovery) services from
Ingress, IngressRoute and HTTPRoute annotations, for `app:` pod status labels on a service, and
for the [Kubernetes](../widgets/collection/kubernetes.html) header widget.

```yaml
mode: cluster              # in the cluster (its service account); default: a kubeconfig; disabled (when unset)
kubeconfig: kube/config    # mode: default only; relative to the config folder. Else $KUBECONFIG or ~/.kube/config
context: home              # mode: default only; else the kubeconfig's current context
ingress: true              # discover Ingresses (default true)
traefik: false             # discover Traefik IngressRoutes
gateway: false             # discover Gateway API HTTPRoutes
```

See [Discovery](#discovery) below. The `kubernetes` widget uses the same
connection.

## Discovery

Services can come from Docker labels and Kubernetes Ingress annotations as well as from
`services.yaml`. Discovered services are merged into the groups. **YAML wins**: a discovered
service with the same group and name as one in `services.yaml` is skipped. Discovered cards carry
a small "auto" badge. Sources are polled every `discovery.interval` (default 30 s).

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
  # pod status labels (app:, and discovered services)
  - apiGroups: ["", "metrics.k8s.io"]
    resources: ["pods"]
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

**Pod status.** As in homepage, a discovered Ingress or route gets the state of its app's pods
as a label (the [Kubernetes pods](../widgets/collection/kubernetes-pods.html) widget): the pods
labelled `app.kubernetes.io/name=<its name>` in its namespace. `homelab.dev/app` names another
app, `homelab.dev/pod-selector` takes a label selector, and `homelab.dev/external: "true"` leaves
the label out. This needs `list` on `pods` (and `pods.metrics.k8s.io` for CPU and memory).

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
