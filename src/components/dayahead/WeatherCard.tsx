import { useMemo, useState } from "react";
import { Cloud, CloudSun, Moon, Sun } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { NOW } from "@/data/engine";
import { cityOf, todayIso, weatherSummary, type Weather, type WeatherDay, type WeatherHour } from "@/lib/dayahead";
import { cv } from "@/components/chart/colors";
import { InteractiveLegend, type LegendItem } from "./InteractiveLegend";

// Themed chart tokens (--ch-*) so the weather lines track the palette and light/dark mode.
const C = { temp: cv("--demand"), feels: cv("--c-solar"), hum: cv("--c-isgs"), wind: cv("--c-ipp"), dew: cv("--c-hydro") };
const ITEMS: LegendItem[] = [
  { key: "temp", label: "Temperature", color: C.temp },
  { key: "feels", label: "Temperature Feels Like", color: C.feels },
  { key: "hum", label: "Humidity", color: C.hum, dashed: true },
  { key: "wind", label: "Wind", color: C.wind },
  { key: "dew", label: "Dew Point", color: C.dew, dashed: true },
];

// Tooltip rows, in this order: wind first, then humidity, temperatures and dew point.
const TIP_ROWS: { key: keyof WeatherHour; label: string; color: string; legend: string }[] = [
  { key: "wind", label: "Wind", color: C.wind, legend: "wind" },
  { key: "gust", label: "Wind Gust", color: C.wind, legend: "wind" },
  { key: "hum", label: "Humidity", color: C.hum, legend: "hum" },
  { key: "temp", label: "Temperature", color: C.temp, legend: "temp" },
  { key: "feels", label: "Temperature Feels Like", color: C.feels, legend: "feels" },
  { key: "dew", label: "Dew Point", color: C.dew, legend: "dew" },
];

/** Shared tooltip: the hour as the header, then a dot, name and value per visible series. */
function WeatherTip({ active, payload, hidden }: { active?: boolean; payload?: { payload: WeatherHour }[]; hidden: Set<string> }) {
  if (!active || !payload?.length) return null;
  const h = payload[0].payload;
  return (
    <div className="min-w-[200px] rounded-lg border bg-popover px-3 py-2 text-[12px] text-popover-foreground shadow-lg">
      <div className="mb-1 font-semibold">
        {(() => { const [a, b] = hourBlocks(h.t), hh = h.t.slice(0, 2); return `Block ${a}–${b} · ${hh}:00–${String(Number(hh) + 1).padStart(2, "0")}:00`; })()}
      </div>
      {TIP_ROWS.filter((r) => !hidden.has(r.legend)).map((r) => (
        <div key={r.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground"><i className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />{r.label}:</span>
          <span className="num font-semibold">{Number(h[r.key]).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

/** Moon at night, sun by day, cloud when cloudy — one per hour above the plot. */
function IconTick({ x = 0, y = 0, index = 0, data }: { x?: number; y?: number; index?: number; data: WeatherHour[] }) {
  const h = data[index];
  if (!h) return null;
  const p = { x: x - 7, y: y - 18, width: 14, height: 14 };
  if (h.cloud >= 70) return <Cloud {...p} color="#94a3b8" />;
  return h.day ? <Sun {...p} color="#f59e0b" fill="#fbbf24" /> : <Moon {...p} color="#f59e0b" fill="#fde68a" />;
}

/** Wind speed under each bar with a gust arrow, the time below that. The API has no wind
 *  direction, so the arrow shows gustiness instead: upright when gusts are close to the mean
 *  wind, turning towards ↓ as gusts reach twice the mean or more. */
/** "13:30" (hour 13's midpoint) → [53, 56]: the first and last block of that hour. */
const hourBlocks = (t: string): [number, number] => { const h = Number(t.split(":")[0]); return [h * 4 + 1, h * 4 + 4]; };

function WindTick({ x = 0, y = 0, index = 0, data }: { x?: number; y?: number; index?: number; data: WeatherHour[] }) {
  const h = data[index];
  if (!h) return null;
  return (
    <g>
      <text x={x - 2} y={y + 10} textAnchor="end" fontSize={9.5} fill="hsl(var(--muted-foreground))">{Math.round(h.wind)}</text>
      <path d="M0,-4 L0,4 M-2.5,-1.5 L0,-4 L2.5,-1.5" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.1} strokeLinecap="round"
        transform={`translate(${x + 5} ${y + 6.5}) rotate(${Math.round(Math.min(180, Math.max(0, (h.gust / (h.wind || 1) - 1) * 180)))})`} />
      {/* each point is one hour = 4 blocks; label it with its first block number (1, 5, 9 … 93) */}
      <text x={x} y={y + 24} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))">{hourBlocks(h.t)[0]}</text>
    </g>
  );
}

/** Card B: weather for the chosen location from the weather API — summary + hourly chart.
 *  The location select is local to this card; every location comes back in one call per date. */
export function WeatherCard({ weather, date, location, onLocation }: {
  weather: Weather; date: string; location: string; onLocation: (id: string) => void;
}) {
  const day = weather.days[location];
  const ids = weather.locations.includes(location) ? weather.locations : [location, ...weather.locations];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[13px] font-bold">{cityOf(location)} Weather</div>
        <select aria-label="Weather location" value={location} onChange={(e) => onLocation(e.target.value)}
          className="h-7 rounded-md border bg-card px-2 text-[12px] font-medium">
          {ids.map((id) => <option key={id} value={id}>{cityOf(id) === id ? id : `${cityOf(id)} (${id})`}</option>)}
        </select>
      </div>
      {weather.loading ? (
        <div className="min-h-0 flex-1 animate-pulse rounded-lg bg-muted" />
      ) : weather.error ? (
        <div className="grid flex-1 place-items-center text-[12px] text-destructive">{weather.error}</div>
      ) : !day ? (
        <div className="grid flex-1 place-items-center text-[12px] text-muted-foreground">No weather data for this date.</div>
      ) : (
        <WeatherBody day={day} date={date} />
      )}
    </div>
  );
}

function WeatherBody({ day, date }: { day: WeatherDay; date: string }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setHidden((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const s = useMemo(() => weatherSummary(day, date), [day, date]);
  const isToday = date === todayIso();
  const Icon = s.cloud >= 70 ? Cloud : s.cloud >= 35 ? CloudSun : Sun;
  const weather = day.hours;
  // 0–30 and 24–60% by default, stretched in steps of 10 / 12 when a location goes past them.
  const lMax = Math.max(30, Math.ceil(Math.max(...weather.flatMap((h) => [h.temp, h.feels, h.wind])) / 10) * 10);
  const hMin = Math.min(24, Math.floor(Math.min(...weather.map((h) => h.hum)) / 12) * 12);
  const hMax = Math.max(60, Math.ceil(Math.max(...weather.map((h) => h.hum)) / 12) * 12);
  const ticks = (lo: number, hi: number, step: number) => Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, k) => lo + k * step);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <div className="flex items-center gap-2">
          <Icon className="h-7 w-7" color={s.cloud >= 70 ? "#94a3b8" : "#f59e0b"} fill={s.cloud >= 70 ? "none" : "#fbbf24"} />
          <span className="num text-[24px] font-bold leading-none">{s.temp.toFixed(1)}°</span>
          <span className="text-[10px] leading-tight text-muted-foreground"><b className="block font-semibold">{s.label}</b>{s.condition}</span>
        </div>
        <span className="h-6 w-px bg-border" />
        <Stat label="High / Low" value={`${Math.round(s.high)}° / ${Math.round(s.low)}°`} color={C.temp} />
        <Stat label="Humidity" value={s.humidity + "%"} color={C.hum} />
        <Stat label="Max wind" value={String(s.maxWind)} color={C.wind} />
        <Stat label="Peak at" value={s.peakAt} />
      </div>

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={weather} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis xAxisId="top" dataKey="t" orientation="top" interval={0} height={22} tickLine={false} axisLine={false} tick={<IconTick data={weather} />} />
            <XAxis dataKey="t" interval={0} height={42} tickLine={false} axisLine={false} tick={<WindTick data={weather} />} />
            <YAxis yAxisId="l" domain={[0, lMax]} ticks={ticks(0, lMax, 10)} allowDataOverflow tickLine={false} axisLine={false} width={26} tick={{ fontSize: 10 }} />
            <YAxis yAxisId="r" orientation="right" domain={[hMin, hMax]} ticks={ticks(hMin, hMax, 12)} allowDataOverflow tickFormatter={(v) => v + "%"} tickLine={false} axisLine={false} width={34} tick={{ fontSize: 10 }} />
            {isToday && (
              <ReferenceArea yAxisId="l" x1={weather[Math.min(23, NOW.getHours())].t} x2={weather[23].t} fill={cv("--c-ipp")} fillOpacity={0.18} />
            )}
            {!hidden.has("wind") && <Bar yAxisId="l" dataKey="wind" name="Wind" fill={C.wind} fillOpacity={0.85} radius={[6, 6, 6, 6]} maxBarSize={18} isAnimationActive={false} />}
            {!hidden.has("temp") && <Line yAxisId="l" dataKey="temp" name="Temperature" stroke={C.temp} strokeWidth={2} dot={false} isAnimationActive={false} />}
            {!hidden.has("feels") && <Line yAxisId="l" dataKey="feels" name="Feels like" stroke={C.feels} strokeWidth={2} dot={false} isAnimationActive={false} />}
            {!hidden.has("hum") && <Line yAxisId="r" dataKey="hum" name="Humidity %" stroke={C.hum} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
            {!hidden.has("dew") && <Line yAxisId="l" dataKey="dew" name="Dew point" stroke={C.dew} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
            {/* No slide animation: it made the box trail and jump between hours. */}
            <Tooltip isAnimationActive={false} content={<WeatherTip hidden={hidden} />} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "4 4" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <InteractiveLegend items={ITEMS} hidden={hidden} onToggle={toggle} variant="line" />
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="num text-[15px] font-bold" style={color ? { color } : undefined}>{value}</span>
    </span>
  );
}
