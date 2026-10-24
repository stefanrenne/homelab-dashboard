# iFrame

Another page in a frame on the card, as homepage's iframe widget: a Grafana panel, a camera
page, a status page. The dashboard allows the page's origin (scheme, host and port of `src`) in
its Content-Security-Policy; every other origin stays blocked. Your browser loads the page
itself, so it must be reachable from the browser, and the page must allow being framed (no
`X-Frame-Options: DENY` or `frame-ancestors` that leaves the dashboard out).

`height` sets the frame's height (default `15rem`); homepage's `classes` are read for their
height (`h-60` is 15rem, the last `h-<n>` counts). `allowScrolling: no` makes the page a picture
that cannot be scrolled or clicked, and `refreshInterval` reloads it every so many milliseconds.

## Fields

No blocks: the frame is drawn by the widget.

## Example

```yaml
# services.yaml
- Monitoring:
    - Power use:
        widget:
          type: iframe
          name: Power use
          src: https://grafana.lan/d-solo/power?orgId=1&panelId=2
          height: 12rem
          allowScrolling: "no"
          refreshInterval: 60000
```
