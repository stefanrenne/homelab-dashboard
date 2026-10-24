# OpenWeatherMap

The current temperature and weather for a place, from [OpenWeatherMap](https://openweathermap.org).
Sign up for a free account and copy an API key under **My API keys**; a new key can take a few
hours to start working. Put the key in `apiKey`, or once in settings.yaml under `providers` and
use `provider: openweathermap` (as in homepage). The key stays on the server.
`cache` keeps an answer for that many minutes, to stay within the free limits. Without `latitude`
and `longitude` the widget uses the viewer's location (HTTPS and permission needed; rounded to
about a kilometre).

Learn more about [OpenWeatherMap](https://openweathermap.org/current).

## Fields

`temperature`, `condition`

## Example

```yaml
# settings.yaml
providers:
  openweathermap: "{{HD_VAR_OWM_KEY}}"

# widgets.yaml
- openweathermap:
    label: Amsterdam
    latitude: 52.37
    longitude: 4.89
    units: metric
    provider: openweathermap
```
