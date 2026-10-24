# Docker container

State, CPU and memory of one container. This is the widget behind a service's `container:`,
which reads the server from `docker.yaml`; used directly, it takes a `socket` or a `url`.

The dashboard only reads from Docker. Give it a
[docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) with `CONTAINERS=1`
rather than the socket itself: see [Discovery](../../discovery.html).

## Fields

`status`, `cpu`, `memory`

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
