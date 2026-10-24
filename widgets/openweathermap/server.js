// The current weather from OpenWeatherMap's free current-weather API.
// Its condition codes are turned into the same condition keys as the openmeteo widget.

export const API = { url: 'https://api.openweathermap.org/data/2.5/weather' }; // replaceable in tests

/** An OpenWeatherMap condition id (https://openweathermap.org/weather-conditions) as a key. */
export function condition(id) {
  if (id >= 200 && id < 300) return 'thunderstorm';
  if (id >= 300 && id < 400) return 'drizzle';
  if (id >= 520 && id < 600) return 'showers';
  if (id >= 500 && id < 520) return 'rain';
  if (id >= 600 && id < 700) return 'snow';
  if (id >= 700 && id < 800) return 'fog';
  if (id === 800) return 'clear';
  if (id === 801 || id === 802) return 'partlyCloudy';
  if (id === 803 || id === 804) return 'cloudy';
  return 'unknown';
}

export default {
  async fetch(ctx) {
    const o = { ...ctx.options };
    // no coordinates in the options: the viewer's location, sent by client.js (ctx.params)
    if (o.latitude === undefined || o.longitude === undefined) {
      const lat = Number(ctx.params?.latitude);
      const lon = Number(ctx.params?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { blocks: [], weather: null, needsLocation: true };
      Object.assign(o, { latitude: lat, longitude: lon });
    }
    const cacheKey = `weather:${o.latitude},${o.longitude}`;
    const cached = ctx.cache.get(cacheKey);
    if (cached && Date.now() - cached.at < Math.max(1, o.cache ?? 5) * 60_000) return cached.data;

    const url = new URL(API.url);
    url.search = new URLSearchParams({
      lat: String(o.latitude),
      lon: String(o.longitude),
      units: o.units === 'imperial' ? 'imperial' : 'metric',
      appid: o.apiKey,
    }).toString();
    const res = await ctx.fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`OpenWeatherMap answered ${res.status}`);
    const body = await res.json();
    const temperature = typeof body.main?.temp === 'number' ? body.main.temp : null;
    const unit = o.units === 'imperial' ? '°F' : '°C';
    const weather = body.weather?.[0] ?? {};
    const key = condition(weather.id);
    const data = {
      blocks: [
        { key: 'temperature', label: 'temperature', value: temperature, unit },
        { key: 'condition', label: 'condition', value: key },
      ],
      weather: { temperature, unit, condition: key, day: !String(weather.icon ?? '').endsWith('n'), label: o.label ?? null, format: o.format ?? null },
    };
    ctx.cache.set(cacheKey, { at: Date.now(), data });
    return data;
  },
};
