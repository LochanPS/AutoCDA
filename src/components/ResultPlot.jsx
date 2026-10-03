import React, { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

/**
 * ResultPlot — a generic plot of a parsed SPICE result (from runSpice).
 *
 * Works for any analysis: AC sweeps render as a Bode-style magnitude-in-dB curve
 * on a log-frequency axis; transient/DC sweeps render magnitude vs the swept
 * variable on a linear axis. Used by both the netlist-import and chain-builder
 * modes, neither of which has a hand-drawn schematic template to lean on.
 */

const GRID = "var(--border)";
const AXIS = "var(--text-3)";
const COLORS = ["#2f6feb", "#1a7f42", "#9a6700", "#b5338a", "#0e7490", "#b91c1c"];

const TOOLTIP_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--text)",
  fontSize: "12px",
  fontFamily: "var(--font-mono, monospace)",
};

function fmtX(v, type) {
  if (v == null || !isFinite(v)) return "";
  if (type === "frequency") {
    return v >= 1e6 ? `${+(v / 1e6).toPrecision(3)}M` : v >= 1e3 ? `${+(v / 1e3).toPrecision(3)}k` : `${+v.toPrecision(3)}`;
  }
  if (type === "time") {
    return v >= 1 ? `${+v.toPrecision(3)}s` : v >= 1e-3 ? `${+(v * 1e3).toPrecision(3)}m` : `${+(v * 1e6).toPrecision(3)}µ`;
  }
  return `${+Number(v).toPrecision(3)}`;
}

// Choose which nodes to draw, capped so the chart stays legible. Prefer out/in.
function pickNodes(nodeNames, max) {
  if (nodeNames.length <= max) return nodeNames;
  const pref = nodeNames.filter((k) => /\b(out|in)\b/i.test(k) || /^(out|in)$/i.test(k));
  const rest = nodeNames.filter((k) => !pref.includes(k));
  return [...pref, ...rest].slice(0, max);
}

export default function ResultPlot({ result, height = 280, maxNodes = 5 }) {
  const { data, series, isFreq, xType, xLabel, yLabel } = useMemo(() => {
    const empty = { data: [], series: [], isFreq: false, xType: null, xLabel: "", yLabel: "" };
    if (!result || !result.sweep || !result.sweep.length) return empty;

    const xType = result.sweepType || "";
    const isFreq = xType === "frequency";
    const allNodes = Object.keys(result.nodes || {});
    if (!allNodes.length) return empty;
    const series = pickNodes(allNodes, maxNodes);

    const sweep = result.sweep;
    const data = sweep.map((x, i) => {
      const row = { x };
      for (const name of series) {
        const mag = (result.nodes[name] || [])[i];
        if (mag == null) continue;
        row[name] = isFreq ? (mag > 0 ? +(20 * Math.log10(mag)).toFixed(2) : -120) : +mag.toPrecision(5);
      }
      return row;
    });

    return {
      data,
      series,
      isFreq,
      xType,
      xLabel: isFreq ? "Frequency (Hz)" : xType === "time" ? "Time" : (result.sweepName || "sweep"),
      yLabel: isFreq ? "Magnitude (dB)" : "Value",
    };
  }, [result, maxNodes]);

  if (!data.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "var(--fs-sm)" }}>
        No plottable data in this result.
      </div>
    );
  }

  return (
    <div style={{ height, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 22, left: 4, bottom: 22 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis
            dataKey="x"
            type="number"
            scale={isFreq ? "log" : "linear"}
            domain={isFreq ? ["dataMin", "dataMax"] : ["dataMin", "dataMax"]}
            tickFormatter={(v) => fmtX(v, xType)}
            tick={{ fill: AXIS, fontSize: 10 }}
            stroke={GRID}
            label={{ value: xLabel, position: "insideBottom", offset: -10, fill: AXIS, fontSize: 11 }}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: AXIS, fontSize: 10 }}
            stroke={GRID}
            width={44}
            label={{ value: yLabel, angle: -90, position: "insideLeft", fill: AXIS, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(v) => `${xLabel.split(" ")[0]} = ${fmtX(v, xType)}`}
            formatter={(val, name) => [isFreq ? `${val} dB` : val, name]}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: "11px" }} />}
          {series.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
