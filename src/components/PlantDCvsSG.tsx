/**
 * Plant DC vs Optimized SG — 96-block chart cards grouped by technology
 * Shows DC (blue) vs Optimized Schedule (orange) for every plant.
 * Fetches from /optimization/iterative/run or /milp/run API.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useOptimization } from "@/hooks/useOptimization";
import { OptMethodSelector } from "@/components/OptMethodSelector";
import type { HorizonId, OptPlantResult } from "@/data/optimizationApi";

// ─── Mini 96-block sparkline chart (pure SVG) ─────────────────────────────

function BlockChart({ dc, sg, actualSg = [], height = 140, id = "chart" }: {
  dc: number[]; sg: number[]; actualSg?: number[]; height?: number; id?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the card's own width (measured), so a wide card gets a wide chart, not a centred one.
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w > 0) setWidth(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = dc.length || 96;
  const max = Math.max(...dc, ...sg, ...(actualSg.length ? actualSg : [0]), 1) * 1.08;
  const L = 32, R = 8, T = 10, B = 22;
  const cw = width - L - R;
  const ch = height - T - B;
  const x = (i: number) => L + (i / (n - 1)) * cw;
  const y = (v: number) => T + ch - (v / max) * ch;
  const bw = cw / n;
  const timeStr = (i: number) => {
    const hr = Math.floor(i * 0.25);
    const mn = (i % 4) * 15;
    return `${hr.toString().padStart(2, "0")}:${mn.toString().padStart(2, "0")}`;
  };
  const uid = id.replace(/[^a-zA-Z0-9]/g, "");

  const linePath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPath = (vals: number[]) =>
    linePath(vals) + ` L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  // Y-axis ticks
  const yTicks = [0, Math.round(max * 0.25), Math.round(max * 0.5), Math.round(max * 0.75), Math.round(max * 0.95)];

  return (
    <div ref={boxRef}>
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}
      style={{ display: "block", cursor: "crosshair", overflow: "visible" }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width * width;
        const idx = Math.round((mx - L) / cw * (n - 1));
        if (idx >= 0 && idx < n) setHover(idx); else setHover(null);
      }}>
      <defs>
        <linearGradient id={`dcGrad_${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
        </linearGradient>
        <linearGradient id={`sgGrad_${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect x={L} y={T} width={cw} height={ch} fill="hsl(var(--muted) / 0.3)" rx={4} />

      {/* Grid lines + Y labels */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={L} y1={y(v)} x2={L + cw} y2={y(v)}
            stroke="hsl(var(--border))" strokeWidth={0.4} strokeDasharray={i === 0 ? "0" : "3,4"} opacity={0.5} />
          <text x={L - 4} y={y(v) + 3} fontSize={8} fill="hsl(var(--muted-foreground))" textAnchor="end" opacity={0.6}>
            {v}
          </text>
        </g>
      ))}

      {/* X-axis time labels */}
      {[0, 12, 24, 36, 48, 60, 72, 84, 95].filter((i) => i < n).map((i) => (
        <text key={i} x={x(i)} y={height - 4} fontSize={7.5} fill="hsl(var(--muted-foreground))" textAnchor="middle" opacity={0.5}>
          {timeStr(i)}
        </text>
      ))}

      {/* Vertical grid at 6h intervals */}
      {[24, 48, 72].filter((i) => i < n).map((i) => (
        <line key={i} x1={x(i)} y1={T} x2={x(i)} y2={T + ch}
          stroke="hsl(var(--border))" strokeWidth={0.3} strokeDasharray="2,6" opacity={0.3} />
      ))}

      {/* DC area fill */}
      <path d={areaPath(dc)} fill={`url(#dcGrad_${uid})`} />
      {/* Optimized SG area fill */}
      <path d={areaPath(sg)} fill={`url(#sgGrad_${uid})`} />

      {/* DC line (blue flat) */}
      <path d={linePath(dc)} fill="none" stroke="#3b82f6" strokeWidth={1.8} strokeLinejoin="round" />
      {/* Actual SG line (grey dashed — before optimization) */}
      {actualSg.length > 0 && <path d={linePath(actualSg)} fill="none" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="4,3" strokeLinejoin="round" opacity={0.7} />}
      {/* Optimized SG line (orange — after optimization) */}
      <path d={linePath(sg)} fill="none" stroke="#f59e0b" strokeWidth={1.8} strokeLinejoin="round" />

      {/* Curtailment zone (gap between DC and SG) */}
      {dc.map((dv, i) => {
        const sv = sg[i] ?? 0;
        if (dv - sv < 1) return null;
        return <rect key={`c${i}`} x={x(i) - bw / 2} y={y(dv)} width={bw} height={y(sv) - y(dv)}
          fill="#ef4444" opacity={0.08} />;
      })}

      {/* Hover handled by onMouseMove on SVG */}

      {/* Hover crosshair + tooltip */}
      {hover !== null && hover < dc.length && (
        <>
          <line x1={x(hover)} y1={T} x2={x(hover)} y2={T + ch}
            stroke="hsl(var(--muted-foreground))" strokeWidth={0.8} strokeDasharray="2,2" />
          <circle cx={x(hover)} cy={y(dc[hover])} r={4} fill="#3b82f6" stroke="#fff" strokeWidth={1.5} />
          {actualSg.length > hover && <circle cx={x(hover)} cy={y(actualSg[hover])} r={3} fill="#94a3b8" stroke="#fff" strokeWidth={1} />}
          <circle cx={x(hover)} cy={y(sg[hover])} r={4} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />

          {/* Tooltip */}
          {(() => {
            const tx = Math.min(Math.max(x(hover) + 10, L + 5), width - 115);
            const ty = Math.max(T + 5, Math.min(y(Math.max(dc[hover], sg[hover])) - 55, T + ch - 60));
            const hasActual = actualSg.length > hover;
            const asg = hasActual ? actualSg[hover] : 0;
            const diff = dc[hover] - sg[hover];
            const boxH = 44 + (hasActual ? 12 : 0) + (diff > 1 ? 12 : 0);
            return (
              <g>
                <rect x={tx - 4} y={ty - 2} width={120} height={boxH} rx={6}
                  fill="rgba(10,10,20,0.92)" stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} />
                <text x={tx + 2} y={ty + 11} fontSize={9.5} fill="#fff" fontWeight={700}>
                  Block {hover + 1} · {timeStr(hover)}
                </text>
                <text x={tx + 2} y={ty + 24} fontSize={9} fill="#3b82f6" fontWeight={600}>
                  ● DC: {dc[hover].toFixed(1)} MW
                </text>
                {hasActual && (
                  <text x={tx + 2} y={ty + 36} fontSize={9} fill="#94a3b8" fontWeight={500}>
                    ● Actual SG: {asg.toFixed(1)} MW
                  </text>
                )}
                <text x={tx + 2} y={ty + (hasActual ? 48 : 36)} fontSize={9} fill="#f59e0b" fontWeight={600}>
                  ● Optimized: {sg[hover].toFixed(1)} MW
                </text>
                {diff > 1 && (
                  <text x={tx + 2} y={ty + (hasActual ? 60 : 48)} fontSize={8.5} fill="#ef4444" fontWeight={500}>
                    ▼ Curtailed: {diff.toFixed(1)} MW
                  </text>
                )}
              </g>
            );
          })()}
        </>
      )}
    </svg>
    </div>
  );
}

// ─── Plant Card ───────────────────────────────────────────────────────────

function PlantCard({ plant, dc96, sg96, actualSg96 = [], idx }: {
  plant: OptPlantResult;
  dc96: number[];
  sg96: number[];
  actualSg96?: number[];
  idx: number;
}) {
  const dcAvg = plant.dc_avg_mw;
  const sgAvg = plant.scheduled_mw;
  const curtPct = dcAvg > 0 ? ((1 - sgAvg / dcAvg) * 100) : 0;
  const hasCurt = curtPct > 1;

  return (
    <div style={{
      border: `1px solid ${hasCurt ? "rgba(239,68,68,0.3)" : "hsl(var(--border))"}`,
      borderRadius: 12,
      padding: 16,
      background: "hsl(var(--card))",
      minWidth: 0,
      transition: "box-shadow 0.2s",
      boxShadow: hasCurt ? "0 0 12px rgba(239,68,68,0.08)" : "0 1px 3px rgba(0,0,0,0.1)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{plant.name}</div>
          <div style={{ fontSize: 11, opacity: 0.45, marginTop: 1 }}>
            {plant.category} · {plant.technology}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
            background: plant.decision === "Full" ? "#22c55e18" : (plant.decision === "OFF" || plant.decision === "Shutdown") ? "#ef444418" : "#f59e0b18",
            color: plant.decision === "Full" ? "#22c55e" : (plant.decision === "OFF" || plant.decision === "Shutdown") ? "#ef4444" : "#f59e0b",
            border: `1px solid ${plant.decision === "Full" ? "#22c55e30" : (plant.decision === "OFF" || plant.decision === "Shutdown") ? "#ef444430" : "#f59e0b30"}`,
          }}>
            {plant.decision}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ margin: "10px -4px 0" }}>
        <BlockChart dc={dc96} sg={sg96} actualSg={actualSg96} id={`plant_${idx}`} />
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8,
        padding: "8px 0", borderTop: "1px solid hsl(var(--border))" }}>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: "#3b82f6", fontWeight: 600 }}>DC: {dcAvg.toFixed(1)}</span>
          <span style={{ opacity: 0.3, margin: "0 6px" }}>→</span>
          <span style={{ color: "#f59e0b", fontWeight: 600 }}>SG: {sgAvg.toFixed(1)}</span>
          <span style={{ opacity: 0.4, fontSize: 10 }}> MW</span>
        </div>
        <span style={{ fontSize: 10, opacity: 0.4 }}>
          ₹{plant.rate_rs_mwh.toLocaleString("en-IN")}/MWh
        </span>
      </div>

      {/* Curtailment info */}
      {hasCurt && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#ef4444",
          padding: "6px 10px", marginTop: 4, borderRadius: 6, background: "rgba(239,68,68,0.06)" }}>
          <span>▼ Curtailed {curtPct.toFixed(0)}%</span>
          <span style={{ fontWeight: 600 }}>Saved ₹{(plant.saving_rs / 1e5).toFixed(2)} Lakh</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export function PlantDCvsSG({ tf = "da" }: { tf?: string }) {
  const { api, loading, error } = useOptimization(tf as HorizonId);
  const [filterTech, setFilterTech] = useState("All");
  const [search, setSearch] = useState("");

  // Group plants by technology
  const { techs, grouped, stats } = useMemo(() => {
    if (!api?.plants) return { techs: [], grouped: {} as Record<string, OptPlantResult[]>, stats: { total: 0, curtailed: 0, saving: 0 } };

    const plants = api.plants;
    const techSet = new Set(plants.map(p => p.technology || "Other"));
    const techs = ["All", ...Array.from(techSet).sort()];

    const filtered = plants.filter(p => {
      const matchTech = filterTech === "All" || p.technology === filterTech;
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      return matchTech && matchSearch;
    });

    const grouped: Record<string, OptPlantResult[]> = {};
    for (const p of filtered) {
      const tech = p.technology || "Other";
      if (!grouped[tech]) grouped[tech] = [];
      grouped[tech].push(p);
    }

    return {
      techs,
      grouped,
      stats: {
        total: filtered.length,
        curtailed: filtered.filter(p => p.curtailed_mwh > 0).length,
        saving: filtered.reduce((s, p) => s + p.saving_rs, 0),
      },
    };
  }, [api, filterTech, search]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", opacity: 0.5 }}>Loading optimization data...</div>;
  if (error) return <div style={{ padding: 20, color: "#f44", background: "#f441", borderRadius: 8 }}>Error: {error}</div>;
  if (!api) return null;

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Plant DC vs Optimized SG</h2>
        <p style={{ fontSize: 13, opacity: 0.5 }}>
          Technology hierarchy — each card shows 96-block{" "}
          <span style={{ color: "#3b82f6", fontWeight: 600 }}>DC (blue)</span> vs{" "}
          <span style={{ color: "#f59e0b", fontWeight: 600 }}>Optimized SG (orange)</span>
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <OptMethodSelector compact />

        <select
          value={filterTech}
          onChange={(e) => setFilterTech(e.target.value)}
          style={{
            padding: "4px 12px", fontSize: 12, borderRadius: 4,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--card))", color: "hsl(var(--foreground))",
          }}
        >
          {techs.map(t => <option key={t} value={t}>{t === "All" ? "All Technologies" : t}</option>)}
        </select>

        <input
          type="text"
          placeholder="Search plant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "4px 12px", fontSize: 12, borderRadius: 4, width: 180,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--card))", color: "hsl(var(--foreground))",
          }}
        />

        <span style={{ fontSize: 12, opacity: 0.5 }}>
          {stats.total} plants · {stats.curtailed} curtailed · ₹{(stats.saving / 1e5).toFixed(1)} Lakh saved
        </span>

        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4,
          background: "hsl(var(--primary) / 0.13)", color: "hsl(var(--primary))" }}>
          {api.method} · {api.runtime_s}s · {api.date}
        </span>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: 12, flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 16, height: 3, background: "#3b82f6", marginRight: 4, verticalAlign: "middle" }} /> DC (Max Declared Capacity)</span>
        <span><span style={{ display: "inline-block", width: 16, marginRight: 4, verticalAlign: "middle", borderTop: "2px dashed #94a3b8", height: 0 }} /> Actual SG (Before Optimization)</span>
        <span><span style={{ display: "inline-block", width: 16, height: 3, background: "#f59e0b", marginRight: 4, verticalAlign: "middle" }} /> Optimized SG (After Optimization)</span>
      </div>

      {/* Technology groups */}
      {Object.entries(grouped).sort().map(([tech, plants]) => (
        <div key={tech} style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: "#f59e0b" }}>⚡</span>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{tech}</h3>
            <span style={{
              fontSize: 11, padding: "1px 8px", borderRadius: 10,
              background: "hsl(var(--primary) / 0.13)", color: "hsl(var(--primary))",
            }}>
              {plants.length} Plants Total
            </span>
          </div>

          {/* Plant cards grid */}
          {/* As many equal columns (≥ 340px) as fit the width, so each row fills the page. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
            {plants.map((p, i) => {
              // Backend sends 3 arrays: DC flat, actual SG, optimized SG
              const dc96: number[] = p.dc_blocks || new Array(96).fill(p.dc_avg_mw);
              const sg96: number[] = p.sg_blocks || new Array(96).fill(p.scheduled_mw);
              const actualSg96: number[] = p.sg_actual_blocks || [];
              return <PlantCard key={p.name} plant={p} dc96={dc96} sg96={sg96} actualSg96={actualSg96} idx={i} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default PlantDCvsSG;
