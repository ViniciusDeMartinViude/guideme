// Open-Meteo: free, no API key. Geocoding + 16-day forecast + historical archive
// (used to estimate the typical climate for a month that is further away).

type GeoResult = {
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

export async function geocode(place: string): Promise<GeoResult | undefined> {
  const data = await getJson<{ results?: GeoResult[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`,
  );
  return data.results?.[0];
}

function label(g: GeoResult): string {
  return [g.name, g.admin1, g.country].filter(Boolean).join(", ");
}

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const r1 = (n: number) => Math.round(n * 10) / 10;

type Daily = {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
};

const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);

/** Next 16 days, day by day. */
export async function getForecast(place: string): Promise<string> {
  const g = await geocode(place);
  if (!g) return `Could not find a place called "${place}".`;
  const data = await getJson<{ daily: Daily }>(
    `https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=16&timezone=${encodeURIComponent(g.timezone)}`,
  );
  const d = data.daily;
  const lines = d.time.map(
    (day, i) =>
      `${day}: ${d.temperature_2m_min[i]}–${d.temperature_2m_max[i]}°C, rain ${d.precipitation_sum[i]} mm`,
  );
  return `16-day forecast for ${label(g)}:\n${lines.join("\n")}`;
}

/** Typical weather for a given month, averaged over the last `years` years of actual data. */
export async function getClimate(place: string, month: number, years = 3): Promise<string> {
  if (month < 1 || month > 12) return "month must be 1–12";
  const g = await geocode(place);
  if (!g) return `Could not find a place called "${place}".`;

  const thisYear = new Date().getUTCFullYear();
  const maxes: number[] = [];
  const mins: number[] = [];
  let rainyDays = 0;
  let totalDays = 0;
  let totalRain = 0;
  const yearsUsed: number[] = [];

  for (let y = thisYear - 1; y >= thisYear - years; y--) {
    const mm = String(month).padStart(2, "0");
    const lastDay = new Date(Date.UTC(y, month, 0)).getUTCDate();
    const data = await getJson<{ daily: Daily }>(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${g.latitude}&longitude=${g.longitude}` +
        `&start_date=${y}-${mm}-01&end_date=${y}-${mm}-${lastDay}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=${encodeURIComponent(g.timezone)}`,
    );
    const d = data.daily;
    const rain = nums(d.precipitation_sum);
    if (!rain.length) continue;
    yearsUsed.push(y);
    maxes.push(...nums(d.temperature_2m_max));
    mins.push(...nums(d.temperature_2m_min));
    rainyDays += rain.filter((p) => p >= 1).length;
    totalRain += rain.reduce((a, b) => a + b, 0);
    totalDays += rain.length;
  }
  if (!totalDays) return `No historical data available for ${label(g)}.`;

  const monthName = new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en", {
    month: "long",
    timeZone: "UTC",
  });
  return (
    `Typical ${monthName} weather in ${label(g)} (actual data ${yearsUsed.join("/")}):\n` +
    `- average daily high ${r1(mean(maxes))}°C, low ${r1(mean(mins))}°C\n` +
    `- hottest day seen ${r1(Math.max(...maxes))}°C, coldest night ${r1(Math.min(...mins))}°C\n` +
    `- rainy days (≥1 mm): ~${Math.round((rainyDays / totalDays) * 30)} per month, ` +
    `~${Math.round(totalRain / yearsUsed.length)} mm per month`
  );
}
