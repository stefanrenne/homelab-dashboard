# Custom API

Shows fields from any JSON API without writing a widget, like homepage's customapi. Each entry
in `mappings` picks a `field` (a dotted path such as `data.stats.count`) and gives it a label.

| Mapping key | What |
|---|---|
| `field` | Dotted path into the JSON answer (required) |
| `label` | Text above the value (default: the field) |
| `format` | `number`, `percent`, `bytes` or `text` |
| `scale` | Multiply a number first, e.g. `100` for a fraction |
| `prefix`, `suffix` | Text around the value |
| `remap` | `[{ value: PLAYING, to: Playing }, { any: true, to: Other }]` |

`headers` is secret: put API keys there, through `{{HD_VAR_...}}`. With `display: list` every
mapping becomes a row instead of a block.

## Fields

The label of each mapping

## Example

```yaml
# services.yaml
- Network:
    - Pi-hole:
        href: http://pihole.lan/admin
        widget:
          type: custom-api
          url: http://pihole.lan/api/stats/summary
          headers: { X-FTL-SID: "{{HD_VAR_PIHOLE_SID}}" }
          mappings:
            - { field: queries.total, label: Queries, format: number }
            - { field: queries.percent_blocked, label: Blocked, format: percent }
```
