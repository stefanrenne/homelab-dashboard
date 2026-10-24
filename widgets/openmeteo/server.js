// The current weather from Open-Meteo (https://open-meteo.com), no key needed.
// WMO weather codes are turned into a condition key for i18n.json and an icon for client.js.

export const API = { url: 'https://api.open-meteo.com/v1/forecast' }; // replaceable in tests

/** A WMO weather code (https://open-meteo.com/en/docs) as a condition key. */
export function condition(code) {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partlyCloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return code >= 80 ? 'showers' : 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunderstorm';
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
      latitude: String(o.latitude),
      longitude: String(o.longitude),
      current: 'temperature_2m,weather_code,is_day',
      timezone: o.timezone || 'auto',
      ...(o.units === 'imperial' ? { temperature_unit: 'fahrenheit' } : {}),
    }).toString();
    const res = await ctx.fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
    const current = (await res.json()).current ?? {};
    const temperature = typeof current.temperature_2m === 'number' ? current.temperature_2m : null;
    const unit = o.units === 'imperial' ? '°F' : '°C';
    const key = condition(current.weather_code);
    const data = {
      blocks: [
        { key: 'temperature', label: 'temperature', value: temperature, unit },
        { key: 'condition', label: 'condition', value: key },
      ],
      weather: { temperature, unit, condition: key, day: current.is_day !== 0, label: o.label ?? null, format: o.format ?? null },
    };
    ctx.cache.set(cacheKey, { at: Date.now(), data });
    return data;
  },
};
