# Ping

Pings a host and shows the round-trip time. `host` is a name, an IP address or a URL (the host
part is used). This is the widget behind a service's `ping:`.

In Docker the image already contains a `ping` that works as the unprivileged `node` user.

## Fields

`latency`, `status`

## Example

```yaml
# services.yaml
- Infrastructure:
    - NAS:
        href: https://nas.lan
        ping: nas.lan                 # the status label in the corner
        widget:
          type: ping
          host: 192.168.1.20
```
