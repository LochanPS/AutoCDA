import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

/**
 * Histogram — the Monte-Carlo yield chart, split into its own module so recharts
 * loads as a separate async chunk (Theme E4: bundle trim). App renders this via
 * React.lazy inside a Suspense boundary, so recharts never ships in the main
 * bundle and only downloads when a user actually runs a tolerance sweep.
 *
 * @param {object[]} bins       - { center, count } bars
 * @param {number}   [target]   - target line (green); omitted → no spec lines
 * @param {number}   tolerance  - fractional spec band (±), drawn as warn lines
 * @param {(x:number)=>string} fmt - axis/tooltip value formatter
 */
export default function Histogram({ bins, target, tolerance, fmt }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={bins} margin={{ top: 8, right: 12, bottom: 20, left: 4 }}>
        <XAxis
          dataKey="center" type="number" domain={["dataMin", "dataMax"]}
          tickFormatter={fmt}
          tick={{ fontSize: 11, fill: "var(--text-3)" }} stroke="var(--border-strong)"
          tickLine={false} minTickGap={40}
        />
        <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} stroke="var(--border-strong)" tickLine={false} allowDecimals={false} width={28} />
        <Tooltip
          cursor={{ fill: "var(--surface-2)" }}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
          labelFormatter={fmt}
          formatter={(val) => [`${val} runs`, "Count"]}
        />
        {target != null && (
          <>
            <ReferenceLine x={target} stroke="var(--success)" strokeWidth={1.5} strokeDasharray="4 3" />
            <ReferenceLine x={target * (1 - tolerance)} stroke="var(--warn)" strokeDasharray="2 3" />
            <ReferenceLine x={target * (1 + tolerance)} stroke="var(--warn)" strokeDasharray="2 3" />
          </>
        )}
        <Bar dataKey="count" fill="var(--accent)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
