# Open-Meteo

The current temperature and weather for a place, from [Open-Meteo](https://open-meteo.com): no
account or key needed. Find the coordinates of a place on a map (right-click in most map apps).
`cache` keeps an answer for that many minutes, to stay within Open-Meteo's free limits.

Learn more about [Open-Meteo](https://open-meteo.com/en/docs).

## Fields

`temperature`, `condition`

## Example

```yaml
# widgets.yaml
- openmeteo:
    label: Amsterdam
    latitude: 52.37
    longitude: 4.89
    timezone: Europe/Amsterdam
    units: metric
    cache: 5
    format:
      maximumFractionDigits: 0
```
