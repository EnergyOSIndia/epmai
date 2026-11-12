// Theme-aware Highcharts base options. Highcharts parses colour strings
// internally, so instead of handing it `var(--token)` (which it can't parse) we
// resolve the app's theme tokens to concrete colours at runtime and rebuild the
// options whenever the selected palette / light-dark mode changes.

import { useEffect, useState } from "react"
import type { ChartOptions } from "@highcharts/react"

export interface ChartTheme {
  text: string
  muted: string
  grid: string
  axis: string
  accent: string
  accentLine: string
  accentFill: string
  median: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
}

/* ---------------- token resolution ---------------- */

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "").trim()
  if (h.length < 6) return hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// Canvas colours (text, grid, axis, tooltip) for light / dark; readTheme() picks the one the app
// currently shows, so the charts follow the app theme like the rest of the page.
const LIGHT = {
  text: "#334155", // slate-700
  muted: "#64748b", // slate-500
  grid: "rgba(100,116,139,0.16)",
  axis: "rgba(100,116,139,0.30)",
  tooltipBg: "rgba(255,255,255,0.97)",
  tooltipText: "#334155",
}
const DARK = {
  text: "#e2e8f0", // slate-200
  muted: "#94a3b8", // slate-400
  grid: "rgba(148,163,184,0.16)",
  axis: "rgba(148,163,184,0.32)",
  tooltipBg: "rgba(17,24,32,0.97)",
  tooltipText: "#e2e8f0",
}
/** Whether the app shows dark right now: the computed colour-scheme of <html> (set by the theme). */
const isDark = () => typeof window !== "undefined" && getComputedStyle(document.documentElement).colorScheme.includes("dark")

function readTheme(): ChartTheme {
  const fallbackAccent = "#0d9488"
  const canvas = isDark() ? DARK : LIGHT
  const base: ChartTheme = {
    ...canvas,
    accent: fallbackAccent,
    accentLine: hexToRgba(fallbackAccent, 0.5),
    accentFill: hexToRgba(fallbackAccent, 0.12),
    median: "#e2683a",
    tooltipBorder: hexToRgba(fallbackAccent, 0.3),
  }
  if (typeof window === "undefined") return base
  const cs = getComputedStyle(document.documentElement)
  const read = (n: string) => cs.getPropertyValue(n).trim()
  const hsl = (triplet: string, a?: number) =>
    triplet ? (a == null ? `hsl(${triplet})` : `hsl(${triplet} / ${a})`) : ""

  // --ch-* are hex colours shared across palettes; fall back to --primary (hsl).
  const accentHex = read("--ch-accent")
  const medianHex = read("--ch-demand")
  const primary = read("--primary")

  const accent = accentHex || (primary ? hsl(primary) : base.accent)
  const accentRgba = (a: number) =>
    accentHex ? hexToRgba(accentHex, a) : primary ? hsl(primary, a) : hexToRgba(base.accent, a)

  return {
    ...canvas,
    accent,
    accentLine: accentRgba(0.5),
    accentFill: accentRgba(0.16),
    median: medianHex || base.median,
    tooltipBorder: accentRgba(0.4),
  }
}

/** The resolved chart theme, re-read whenever the palette / light-dark mode flips. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(readTheme)
  useEffect(() => {
    const update = () => setTheme(readTheme())
    update()
    const root = document.documentElement
    const mo = new MutationObserver(update)
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-palette", "class", "style"] })
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    mq.addEventListener("change", update)
    return () => { mo.disconnect(); mq.removeEventListener("change", update) }
  }, [])
  return theme
}

/* ---------------- option builders ---------------- */

/**
 * Compact legend docked to the right and vertically scrollable (Highcharts'
 * built-in legend pagination kicks in past `maxHeight`). Pass the chart height.
 */
export function sideLegend(t: ChartTheme, chartHeight: number): NonNullable<ChartOptions["legend"]> {
  return {
    enabled: true,
    layout: "vertical",
    align: "right",
    verticalAlign: "top",
    width: 120,
    itemWidth: 56,
    maxHeight: Math.max(120, chartHeight - 70),
    itemStyle: { color: t.text, fontWeight: "500", fontSize: "10px" },
    itemHoverStyle: { color: t.text },
    itemHiddenStyle: { color: t.muted },
    navigation: { activeColor: t.accent, inactiveColor: t.muted, style: { fontSize: "9px" } },
  }
}

/** Base options merged into every chart in the grid, coloured for the active theme. */
export function baseChart(t: ChartTheme, overrides: ChartOptions = {}): ChartOptions {
  return {
    chart: {
      backgroundColor: "transparent",
      style: { fontFamily: "inherit" },
      spacing: [10, 10, 8, 6],
      animation: false,
      ...(overrides.chart ?? {}),
    },
    title: { text: undefined },
    credits: { enabled: false },
    accessibility: { enabled: false },
    legend: {
      itemStyle: { color: t.text, fontWeight: "500" },
      itemHoverStyle: { color: t.text },
      itemHiddenStyle: { color: t.muted },
    },
    xAxis: {
      lineColor: t.axis,
      tickColor: t.axis,
      gridLineColor: t.grid,
      labels: { style: { color: t.muted, fontSize: "11px" } },
      title: { style: { color: t.muted } },
    },
    yAxis: {
      gridLineColor: t.grid,
      lineColor: t.axis,
      labels: { style: { color: t.muted, fontSize: "11px" } },
      title: { style: { color: t.muted } },
    },
    ...overrides,
    // `...overrides` replaces the whole `chart` block; keep the transparent canvas (the cell's
    // themed background shows through) unless the chart sets its own.
    ...(overrides.chart ? { chart: { backgroundColor: "transparent", ...overrides.chart } } : {}),
    tooltip: {
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      borderWidth: 1,
      borderRadius: 10,
      shadow: { color: "rgba(15, 23, 42, 0.22)", offsetX: 0, offsetY: 4, width: 6 },
      style: { color: t.tooltipText, fontSize: "12px" },
      padding: 10,
      ...(overrides.tooltip ?? {}),
    },
  }
}
