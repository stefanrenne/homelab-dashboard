# Kubernetes pods

State, CPU and memory of an app's pods, as in homepage. This is the widget behind a service's
`app:` (with `namespace:` and optionally `podSelector:`): the state shows as a label in the
card's corner (`running`, `partial` when only some pods run, which is marked), and a click on
it shows the pods, CPU and memory. Discovered Ingresses and routes get it too, with their own
name as `app` (the `app`, `pod-selector` and `external` annotations change that).

`app` matches pods labelled `app.kubernetes.io/name=<app>`; `podSelector` takes any label
selector instead (`app.kubernetes.io/instance in (synapse, element)`; an empty one selects every
pod in the namespace). CPU is a share of the pods' CPU limits when they have them, else cores.
`external: true` on a service leaves the label out.

The connection is the one of kubernetes.yaml (see [Discovery](../../discovery.html#kubernetes)).
Give the account read access to pods and their metrics, and install
[metrics-server](https://github.com/kubernetes-sigs/metrics-server) for CPU and memory:

```yaml
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["list"]
  - apiGroups: ["metrics.k8s.io"]
    resources: ["pods"]
    verbs: ["list"]
```

Learn more about [Kubernetes labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/).

## Fields

`status`, `pods`, `cpu`, `mem`

## Example

```yaml
# services.yaml
- Media:
    - Jellyfin:
        href: https://jellyfin.lan
        namespace: media
        app: jellyfin                  # pods labelled app.kubernetes.io/name=jellyfin
    - Chat:
        href: https://chat.lan
        namespace: comms
        app: matrix
        podSelector: app.kubernetes.io/instance in (synapse, element)
    - Grafana pods:
        widget:                        # or as a widget on the card
          type: kubernetes-pods
          namespace: monitoring
          app: grafana
```
