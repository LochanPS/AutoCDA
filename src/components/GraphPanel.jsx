import React, { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer, Cell, LabelList,
} from "recharts";

function generateBodeData(filterType, fc) {
  const points = [];
  const decades = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  for (const f of decades) {
    const ratio = f / fc;
    let gain;
    if (filterType === "lowpass") {
      gain = 20 * Math.log10(1 / Math.sqrt(1 + ratio * ratio));
    } else {
      gain = 20 * Math.log10(ratio / Math.sqrt(1 + ratio * ratio));
    }
    points.push({ f, gain: parseFloat(gain.toFixed(2)), label: formatHz(f) });
  }
  return points;
}

function formatHz(f) {
  if (f >= 1000) return (f / 1000) + "k";
  return String(f);
}

function generateWaveformData(input, output, frequency, phaseInvert) {
  const points = [];
  const duration = 0.003;
  const n = 200;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * duration;
    const tMs = parseFloat((t * 1000).toFixed(4));
    const inV = parseFloat((input.amplitude * Math.sin(2 * Math.PI * frequency * t)).toFixed(4));
    const outV = parseFloat(
      (output.amplitude * Math.sin(2 * Math.PI * frequency * t + (phaseInvert ? Math.PI : 0))).toFixed(4)
    );
    points.push({ t: tMs, vin: inV, vout: outV });
  }
  return points;
}

const GRID = "#dce1e7";
const AXIS_TEXT = "#5b6774";
const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #dce1e7",
  borderRadius: "6px",
  color: "#1c2530",
  fontSize: "12px",
  fontFamily: "'JetBrains Mono', monospace",
};

export default function GraphPanel({ circuit, visible }) {
  const graphData = useMemo(() => {
    if (!circuit) return null;
    const g = circuit.graph;
    if (g.type === "bode") return generateBodeData(g.filterType, g.cutoffFrequency);
    if (g.type === "waveform") return generateWaveformData(g.input, g.output, g.frequency, g.phaseInvert);
    return g.data;
  }, [circuit]);

  if (!circuit) {
    return (
      <div style={panelStyle}>
        <PanelHeader title="Response" />
        <div style={emptyStyle}>Run a design to see its response.</div>
      </div>
    );
  }

  const g = circuit.graph;

  return (
    <div style={{ ...panelStyle, opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}>
      <PanelHeader title="Response" />
      <div style={{ flex: 1, padding: "14px 10px 10px", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)", marginBottom: "10px", paddingLeft: "8px", fontWeight: 500 }}>
          {g.title}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {g.type === "bode" && (
            <BodePlot data={graphData} g={g} />
          )}
          {g.type === "bar" && (
            <BarPlot data={graphData} g={g} />
          )}
          {g.type === "waveform" && (
            <WaveformPlot data={graphData} g={g} />
          )}
        </div>
      </div>
    </div>
  );
}

function BodePlot({ data, g }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS_TEXT, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
          label={{ value: g.xLabel, position: "insideBottom", offset: -10, fill: AXIS_TEXT, fontSize: 10 }}
        />
        <YAxis
          domain={[-60, 5]}
          tick={{ fill: AXIS_TEXT, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
          label={{ value: g.yLabel, angle: -90, position: "insideLeft", fill: AXIS_TEXT, fontSize: 10 }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v) => [`${v} dB`, "Gain"]}
          labelFormatter={(l) => `f = ${l} Hz`}
        />
        <ReferenceLine
          x={formatHz(g.cutoffFrequency)}
          stroke="#9a6700"
          strokeDasharray="6 3"
          label={{ value: `fc=${formatHz(g.cutoffFrequency)}Hz`, fill: "#9a6700", fontSize: 10 }}
        />
        <Line
          type="monotone"
          dataKey="gain"
          stroke="#2f6feb"
          strokeWidth={2}
          dot={false}
          isAnimationActive={true}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function BarPlot({ data, g }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS_TEXT, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
        />
        <YAxis tick={{ fill: AXIS_TEXT, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="value" isAnimationActive={true} radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
          <LabelList
            dataKey="value"
            position="top"
            style={{ fill: "#1c2530", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" }}
            formatter={(v) => data[0]?.unit ? `${v} ${data[0].unit}` : v}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function WaveformPlot({ data, g }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis
          dataKey="t"
          tick={{ fill: AXIS_TEXT, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
          label={{ value: g.xLabel, position: "insideBottom", offset: -10, fill: AXIS_TEXT, fontSize: 10 }}
          tickFormatter={(v) => v.toFixed(1)}
        />
        <YAxis
          tick={{ fill: AXIS_TEXT, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
          label={{ value: g.yLabel, angle: -90, position: "insideLeft", fill: AXIS_TEXT, fontSize: 10 }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v, name) => [`${v} V`, name === "vin" ? g.input.label : g.output.label]}
          labelFormatter={(l) => `t = ${parseFloat(l).toFixed(2)} ms`}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: value === "vin" ? g.input.color : g.output.color, fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" }}>
              {value === "vin" ? g.input.label : g.output.label}
            </span>
          )}
        />
        <Line type="monotone" dataKey="vin" stroke={g.input.color} strokeWidth={2} dot={false} isAnimationActive={true} />
        <Line type="monotone" dataKey="vout" stroke={g.output.color} strokeWidth={2} dot={false} isAnimationActive={true} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function PanelHeader({ title }) {
  return (
    <div style={{
      padding: "13px 18px",
      fontSize: "var(--fs-sm)",
      color: "var(--text-2)",
      fontWeight: 600,
      borderBottom: "1px solid var(--border)",
      flexShrink: 0,
    }}>
      {title}
    </div>
  );
}

const panelStyle = {
  width: "100%",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r)",
  boxShadow: "var(--shadow-sm)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  height: "100%",
};

const emptyStyle = {
  color: "var(--text-3)",
  fontSize: "var(--fs-sm)",
  padding: "20px",
  textAlign: "center",
  margin: "auto",
};
