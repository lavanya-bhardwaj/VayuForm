/* Small SVG chart primitives for the AI and ML pages. Hand-drawn, so the app needs no charting library. */

export const PALETTE = ["#3fb884", "#e0703f", "#5aa9e6", "#f2b84b", "#8b7fd1", "#e46d8c", "#2fb5a6", "#c9a66b"];

export function Card({ title, sub, children, wide = false }) {
  return (
    <section className={`page-card ${wide ? "wide" : ""}`}>
      {title && <h3 className="page-card-title">{title}</h3>}
      {sub && <p className="page-card-sub">{sub}</p>}
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, hint, tone = "good" }) {
  return (
    <div className={`stat-tile tone-${tone}`}>
      <span className="stat-tile-label">{label}</span>
      <strong className="stat-tile-value">
        {value}
        {unit && <small> {unit}</small>}
      </strong>
      {hint && <span className="stat-tile-hint">{hint}</span>}
    </div>
  );
}

/** Horizontal bars drawn with CSS, so the labels stay sharp at any width. */
export function BarList({ items, format = (v) => v.toLocaleString("en-IN"), color = "var(--primary)" }) {
  const max = Math.max(1e-9, ...items.map((i) => i.value));
  return (
    <ul className="bar-list">
      {items.map((item) => (
        <li key={item.label}>
          <span className="bar-list-label">{item.label}</span>
          <span className="bar-list-track">
            <span className="bar-list-fill" style={{ width: `${(item.value / max) * 100}%`, background: item.color ?? color }} />
          </span>
          <span className="bar-list-value">{format(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Vertical bars with labels underneath. */
export function Histogram({ values, labels, color = "var(--primary)", height = 180 }) {
  const width = 360;
  const pad = { top: 12, right: 8, bottom: 40, left: 8 };
  const max = Math.max(1e-9, ...values);
  const slot = (width - pad.left - pad.right) / values.length;
  const barW = slot * 0.7;
  const plotH = height - pad.top - pad.bottom;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img">
      {values.map((v, i) => {
        const h = (v / max) * plotH;
        const x = pad.left + i * slot + (slot - barW) / 2;
        return (
          <g key={i}>
            <rect x={x} y={pad.top + plotH - h} width={barW} height={Math.max(h, 1)} rx="3" fill={color} />
            <text x={x + barW / 2} y={pad.top + plotH - h - 4} textAnchor="middle" className="chart-tick">
              {v}
            </text>
            <text x={x + barW / 2} y={height - 22} textAnchor="middle" className="chart-tick">
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** A ring split into parts. The centre can carry one headline number. */
export function Donut({ parts, size = 170, centerValue, centerLabel }) {
  const total = Math.max(1e-9, parts.reduce((s, p) => s + p.value, 0));
  const r = 62;
  const stroke = 22;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 160 160" width={size} height={size} role="img">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        {parts.map((p) => {
          const len = (p.value / total) * circ;
          const seg = (
            <circle
              key={p.label}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            />
          );
          offset += len;
          return seg;
        })}
        {centerValue !== undefined && (
          <>
            <text x="80" y="82" textAnchor="middle" className="donut-value">{centerValue}</text>
            <text x="80" y="100" textAnchor="middle" className="donut-label">{centerLabel}</text>
          </>
        )}
      </svg>
      <ul className="donut-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <span className="swatch" style={{ background: p.color }} />
            {p.label} <strong>{p.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One or more lines over the same x positions. */
export function LineChart({ series, labels = [], height = 220, yFormat = (v) => v.toFixed(3) }) {
  const width = 640;
  const pad = { top: 16, right: 16, bottom: 30, left: 56 };
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i) => pad.left + (n <= 1 ? 0 : (i / (n - 1)) * (width - pad.left - pad.right));
  const y = (v) => pad.top + (1 - (v - lo) / span) * (height - pad.top - pad.bottom);
  const ticks = [0, 1, 2, 3, 4].map((t) => lo + (span * t) / 4);
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="chart-gridline" />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">{yFormat(t)}</text>
          </g>
        ))}
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth="2.2"
            strokeLinejoin="round"
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          />
        ))}
        {labels.length > 0 &&
          labels.map((l, i) =>
            i % Math.ceil(labels.length / 6) === 0 ? (
              <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="chart-tick">{l}</text>
            ) : null
          )}
      </svg>
      <ul className="chart-legend">
        {series.map((s) => (
          <li key={s.name}>
            <span className="swatch" style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Predicted against actual. Points on the diagonal are perfect. */
export function ScatterPlot({ points, xLabel, yLabel, height = 300, unit = "" }) {
  const width = 480;
  const pad = { top: 16, right: 16, bottom: 44, left: 56 };
  const all = points.flatMap((p) => [p.actual, p.predicted]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const sx = (v) => pad.left + ((v - lo) / span) * (width - pad.left - pad.right);
  const sy = (v) => pad.top + (1 - (v - lo) / span) * (height - pad.top - pad.bottom);
  const ticks = [0, 1, 2, 3, 4].map((t) => lo + (span * t) / 4);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={width - pad.right} y1={sy(t)} y2={sy(t)} className="chart-gridline" />
          <text x={pad.left - 8} y={sy(t) + 4} textAnchor="end" className="chart-tick">{t.toFixed(1)}</text>
          <text x={sx(t)} y={height - 24} textAnchor="middle" className="chart-tick">{t.toFixed(1)}</text>
        </g>
      ))}
      <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} className="chart-diagonal" />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.actual)} cy={sy(p.predicted)} r="2.6" fill="var(--primary)" fillOpacity="0.55" />
      ))}
      <text x={(pad.left + width - pad.right) / 2} y={height - 4} textAnchor="middle" className="chart-axis-label">
        Actual {xLabel} {unit}
      </text>
      <text x="14" y={height / 2} textAnchor="middle" transform={`rotate(-90 14 ${height / 2})`} className="chart-axis-label">
        Predicted {yLabel}
      </text>
    </svg>
  );
}
