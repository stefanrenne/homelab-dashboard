# Date and time

The current date and time, formatted for the dashboard language (or `locale`). Meant for the
header in `widgets.yaml`. It runs in the browser only, so it shows the viewer's own clock.

## Example

```yaml
# widgets.yaml
- datetime:
    dateStyle: full     # full, long, medium, short, none
    timeStyle: short
```
