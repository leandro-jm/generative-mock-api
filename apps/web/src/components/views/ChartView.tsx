import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Chart } from "../../lib/api";
import { compact, money, number } from "../../lib/format";

// Paleta categórica (ordem fixa) com contraste nos dois temas.
const COLORS = ["#4f46e5", "#0891b2", "#ea580c", "#16a34a", "#db2777", "#7c3aed", "#ca8a04", "#0d9488"];

/** View chart: desenha { type, labels, series } com Recharts. */
export function ChartView({ chart, height = 320 }: { chart: Chart; height?: number }) {
  const rows = chart.labels.map((label, i) => Object.fromEntries([["label", label], ...chart.series.map((s) => [s.name, s.data[i]])]));
  const fmt = (v: unknown) => (chart.unit === "BRL" ? money(v) : chart.unit === "%" ? `${number(v)}%` : number(v));
  const axis = { stroke: "currentColor", fontSize: 11, tickLine: false, axisLine: false } as const;
  const tooltip = <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />;
  const multi = chart.series.length > 1;

  return (
    <div className="text-slate-500" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {chart.type === "pie" ? (
          <PieChart>
            <Pie isAnimationActive={false} data={chart.labels.map((l, i) => ({ name: l, value: chart.series[0]?.data[i] ?? 0 }))} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="80%" paddingAngle={1}>
              {chart.labels.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            {tooltip}
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        ) : chart.type === "line" ? (
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} tickFormatter={(v) => compact(v, chart.unit)} width={84} />
            {tooltip}
            {multi && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {chart.series.map((s, i) => <Line key={s.name} dataKey={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}
          </LineChart>
        ) : chart.type === "area" ? (
          <AreaChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} tickFormatter={(v) => compact(v, chart.unit)} width={84} />
            {tooltip}
            {multi && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {chart.series.map((s, i) => <Area key={s.name} dataKey={s.name} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.2} stackId={multi ? "a" : undefined} />)}
          </AreaChart>
        ) : (
          <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} vertical={false} />
            <XAxis dataKey="label" {...axis} interval={0} angle={rows.length > 6 ? -30 : 0} textAnchor={rows.length > 6 ? "end" : "middle"} height={rows.length > 6 ? 70 : 30} />
            <YAxis {...axis} tickFormatter={(v) => compact(v, chart.unit)} width={84} />
            {tooltip}
            {multi && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {chart.series.map((s, i) => <Bar key={s.name} dataKey={s.name} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} stackId={multi ? "a" : undefined} />)}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
