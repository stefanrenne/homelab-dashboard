# System resources

CPU, memory and disk usage as meters, like homepage's resources widget. It measures the machine
(or container) the dashboard runs on: in Docker, mount a host folder to see that disk, for
example `-v /mnt/data:/mnt/data:ro`. Meters turn amber from 85% and red from 95%.

`cpu` and `memory` are off by default; turn on what you want to see.

## Fields

`cpu`, `memory`, `disk` (with one mount point), or one per mount point named after it (`/`, `/mnt/data`)

## Example

```yaml
# widgets.yaml
- resources:
    cpu: true
    memory: true
    disk: ["/", "/mnt/data"]
    label: Server
```
