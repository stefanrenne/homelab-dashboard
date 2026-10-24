# HTTP status

Checks that a URL answers and shows the status code and response time. This is the widget
behind a service's `siteMonitor:`; use it directly for a second URL or to show the blocks.
`HEAD` is the default; use `GET` for servers that do not answer `HEAD` properly.

## Fields

`status`, `latency`

## Example

```yaml
# services.yaml
- Infrastructure:
    - Router:
        href: https://router.lan
        siteMonitor: https://router.lan          # the status label in the corner
        widget:
          type: http-status
          url: https://router.lan/api/health
          method: GET
```
