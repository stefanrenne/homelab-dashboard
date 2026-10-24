# Docker container

State, CPU and memory of one container. This is the widget behind a service's `container:`,
which reads the server from `docker.yaml`; used directly, it takes a `socket` or a `url`.

The dashboard only reads from Docker. Give it a
[docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) with `CONTAINERS=1`
rather than the socket itself: see [Discovery](../../discovery.html).

A Docker daemon over TLS (port 2376) is set up in `docker.yaml` with `tls: { caFile, certFile,
keyFile }` (see [Configuration](../../configuration.html#dockeryaml)); the dashboard fills in
`tlsCa`, `tlsCert` and `tlsKey` for `container:` from those files.

With `swarm: true` (set from docker.yaml's `swarm: true` for `container:`), a name that is no
container is looked up as a Swarm service: its running tasks against the replicas (`replicas`),
marked when only some run.

## Fields

`status`, `replicas`, `cpu`, `memory`

## Example

```yaml
# services.yaml
- Media:
    - Plex:
        href: http://plex.lan:32400
        container: plex                # state label in the corner, from docker.yaml
        widget:
          type: docker
          container: plex
          url: http://socket-proxy:2375
```
