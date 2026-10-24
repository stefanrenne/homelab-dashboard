# System resources

CPU, memory, disk, CPU temperature, uptime and network as meters, like homepage's resources
widget. It measures the machine (or container) the dashboard runs on: in Docker, mount a host
folder to see that disk, for example `-v /mnt/data:/mnt/data:ro`. Meters turn amber from 85% and
red from 95%.

Everything is off by default; turn on what you want to see. `cputemp` and `network` read Linux's
`/sys`: the temperature is the highest thermal zone, `network: true` follows the default route
(or name an interface, `network: eno1`; in Docker mount `/sys:/sys:ro` for a host interface).
`expanded: true` adds used / total under memory and disk, and the CPU load.

## Fields

`cpu`, `memory`, `disk` (with one mount point), or one per mount point named after it (`/`, `/mnt/data`), `cputemp`, `uptime`, `rx`, `tx`

## Example

```yaml
# widgets.yaml
- resources:
    cpu: true
    memory: true
    disk: ["/", "/mnt/data"]
    cputemp: true
    uptime: true
    network: true
    expanded: true
    label: Server
```
