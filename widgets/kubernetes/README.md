# Kubernetes

CPU and memory of the Kubernetes cluster the dashboard runs in: the cluster as a whole, and a line
per node (a node that is not Ready is marked). Capacity is the nodes' allocatable CPU and memory;
usage comes from [metrics-server](https://github.com/kubernetes-sigs/metrics-server), so install
that first (without it the usage shows as –).

The dashboard uses its pod's service account. Give it read access to nodes and their metrics:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata: { name: homelab-dashboard-nodes }
rules:
  - apiGroups: [""]
    resources: ["nodes"]
    verbs: ["get", "list"]
  - apiGroups: ["metrics.k8s.io"]
    resources: ["nodes"]
    verbs: ["get", "list"]
```

Bind it to the dashboard's service account with a ClusterRoleBinding, as for discovery.

Learn more about [Kubernetes](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_top/).

## Fields

`cpu`, `memory` (cluster usage in %), `nodes`, `ready`

## Example

```yaml
# widgets.yaml
- kubernetes:
    cluster:
      show: true
      cpu: true
      memory: true
      showLabel: true
      label: Cluster
    nodes:
      show: true
      cpu: true
      memory: true
      showLabel: true
```
