/*
 * Charts for the AI view. They animate when mounted (the page remounts each time it opens),
 * and every point or bar shows its values on hover. Kept separate so the ML page's charts stay as they are.
 */
import { useId } from "react";

const W = 640;
const PAD = { top: 22, right: 26, bottom: 14, left: 58 };

/** Smooth curve through the points (Catmull-Rom converted to cubic Béziers). */
function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Temperature after each step, drawn left to right. points[0] is the baseline, then one value per technique.
 * details[i] is { title, rows: [[label, value]] } shown when point i is hovered.
 */
export function TraceLine({ points, labels, details, color = "#e0703f", unit = "°C", drawSeconds = 2.2, tall = false }) {
  // Plot height matches the box the page gives it, so the dots and the curve share one coordinate system.
  const H = tall ? 330 : 280;
  const n = points.length;
  const lo = Math.min(...points) - 0.6;
  const hi = Math.max(...points) + 0.6;
  const span = hi - lo || 1;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const xAt = (i) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v) => PAD.top + (1 - (v - lo) / span) * plotH;
  const coords = points.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const line = smoothPath(coords);
  const baseY = PAD.top + plotH;
  const area = n > 1 ? `${line} L ${xAt(n - 1)} ${baseY} L ${xAt(0)} ${baseY} Z` : "";
  const ticks = [0, 1, 2, 3, 4].map((t) => lo + (span * t) / 4);
  const pct = (px, total) => `${(px / total) * 100}%`;
  // useId gives ids like ":r1:", which are not valid in url(#…), so strip the colons.
  const uid = useId().replace(/:/g, "");
  const strokeId = `trace-stroke-${uid}`;
  const fillId = `trace-fill-${uid}`;

  return (
    <div className={`trace ${tall ? "tall" : ""}`} style={{ "--trace-color": color, "--draw": `${drawSeconds}s` }}>
      <div className="trace-plot" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="trace-svg" role="img" aria-label="Indoor peak temperature after each technique">
          <defs>
            <linearGradient id={strokeId} x1={PAD.left} x2={W - PAD.right} y1="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#5aa9e6" />
              <stop offset="50%" stopColor="#f2b84b" />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
            <linearGradient id={fillId} x1="0" x2="0" y1={PAD.top} y2={baseY} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={color} stopOpacity="0.38" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yAt(t)} y2={yAt(t)} className="chart-gridline" />
              <text x={PAD.left - 10} y={yAt(t) + 4} textAnchor="end" className="chart-tick">
                {t.toFixed(1)}
              </text>
            </g>
          ))}
          {area && <path d={area} fill={`url(#${fillId})`} className="trace-area" />}
          <path pathLength="1" d={line} fill="none" stroke={`url(#${strokeId})`} className="trace-line" />
        </svg>

        {coords.map((c, i) => {
          const delay = n > 1 ? (drawSeconds * i) / (n - 1) : 0;
          const edge = i === 0 ? "first" : i === n - 1 ? "last" : "";
          const d = details[i];
          return (
            <div key={i} className={`trace-point ${edge}`} style={{ left: pct(c.x, W), top: pct(c.y, H), animationDelay: `${delay}s` }}>
              <span className="trace-dot" />
              <div className="trace-tip">
                <strong>{d?.title ?? labels[i]}</strong>
                {(d?.rows ?? [["Peak", `${points[i].toFixed(2)} ${unit}`]]).map(([k, val]) => (
                  <span key={k}>
                    {k} <b>{val}</b>
                  </span>
                ))}
              </div>
            </div>
          );
        })}

        {labels.map((label, i) => (
          <span key={`l-${i}`} className={`trace-x ${i === 0 ? "first" : i === n - 1 ? "last" : ""}`} style={{ left: pct(xAt(i), W) }}>
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
