/*
 * Charts for the AI view. They animate when mounted (the page remounts each time it opens),
 * and every point or bar shows its values on hover. Kept separate so the ML page's charts stay as they are.
 */

const W = 640;
const H = 280;
const PAD = { top: 22, right: 26, bottom: 14, left: 58 };

/**
 * Temperature after each step, drawn left to right. points[0] is the baseline, then one value per technique.
 * details[i] is a list of [label, value] pairs shown when point i is hovered.
 */
export function TraceLine({ points, labels, details, color = "#e0703f", unit = "°C", drawSeconds = 1.8 }) {
  const n = points.length;
  const lo = Math.min(...points) - 0.6;
  const hi = Math.max(...points) + 0.6;
  const span = hi - lo || 1;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const xAt = (i) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v) => PAD.top + (1 - (v - lo) / span) * plotH;
  const linePoints = points.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const areaPoints = `${xAt(0)},${PAD.top + plotH} ${linePoints} ${xAt(n - 1)},${PAD.top + plotH}`;
  const ticks = [0, 1, 2, 3, 4].map((t) => lo + (span * t) / 4);
  const pct = (px, total) => `${(px / total) * 100}%`;

  return (
    <div className="trace" style={{ "--trace-color": color, "--draw": `${drawSeconds}s` }}>
      <div className="trace-plot">
      <svg viewBox={`0 0 ${W} ${H}`} className="trace-svg" role="img" aria-label="Indoor peak temperature after each technique">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yAt(t)} y2={yAt(t)} className="chart-gridline" />
            <text x={PAD.left - 10} y={yAt(t) + 4} textAnchor="end" className="chart-tick">
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        <polygon points={areaPoints} className="trace-area" />
        <polyline pathLength="1" points={linePoints} className="trace-line" />
      </svg>

      {points.map((v, i) => {
        const delay = n > 1 ? (drawSeconds * i) / (n - 1) : 0;
        const left = pct(xAt(i), W);
        const top = pct(yAt(v), H);
        const edge = i === 0 ? "first" : i === n - 1 ? "last" : "";
        return (
          <div key={i} className={`trace-point ${edge}`} style={{ left, top, animationDelay: `${delay}s` }}>
            <span className="trace-dot" />
            <div className="trace-tip">
              <strong>{details[i]?.title ?? labels[i]}</strong>
              {(details[i]?.rows ?? [[`Peak`, `${v.toFixed(2)} ${unit}`]]).map(([k, val]) => (
                <span key={k}>
                  {k} <b>{val}</b>
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {labels.map((label, i) => (
        <span
          key={`l-${i}`}
          className={`trace-x ${i === 0 ? "first" : i === n - 1 ? "last" : ""}`}
          style={{ left: pct(xAt(i), W) }}
        >
          {label}
        </span>
      ))}
      </div>
    </div>
  );
}

/**
 * One bar per technique. Bars grow from zero in turn, and each shows its details on hover.
 * details[i] is a list of [label, value] pairs.
 */
export function GrowBars({ items, details, unit = "°C", color = "var(--primary)", format = (v) => v.toFixed(2) }) {
  const max = Math.max(1e-9, ...items.map((i) => i.value));
  return (
    <ul className="grow-bars">
      {items.map((item, i) => (
        <li key={item.label} className="grow-row" style={{ animationDelay: `${0.12 * i}s` }}>
          <span className="grow-label">{item.label}</span>
          <span className="grow-track">
            <span
              className="grow-fill"
              style={{ width: `${(item.value / max) * 100}%`, background: item.color ?? color, animationDelay: `${0.12 * i + 0.1}s` }}
            />
          </span>
          <span className="grow-value">
            {format(item.value)} {unit}
          </span>
          <div className="grow-tip">
            <strong>{item.label}</strong>
            {(details?.[i] ?? []).map(([k, v]) => (
              <span key={k}>
                {k} <b>{v}</b>
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
