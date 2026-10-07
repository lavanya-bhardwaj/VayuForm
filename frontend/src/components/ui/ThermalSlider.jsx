import { getThermalGradientColors, getThermalStatus } from "../../utils/thermal";

export default function ThermalSlider({
  value = 100,
  onChange,
  opacity = 0.58,
  onOpacityChange,
  showJali = true,
  onToggleJali,
}) {
  const { top, bottom, accent } = getThermalGradientColors(value);
  const status = getThermalStatus(value);

  const presets = [
    { score: 100, label: "100 · Red (Max Solar Heat)" },
    { score: 75, label: "75 · Orange" },
    { score: 50, label: "50 · Yellow" },
    { score: 25, label: "25 · Green" },
    { score: 0, label: "0 · Blue (Coolest)" },
  ];

  return (
    <div className="thermal-slider-card">
      <div className="thermal-slider-header">
        <div className="thermal-title-group">
          <div
            className="thermal-gradient-swatch"
            style={{
              background: `linear-gradient(to bottom, ${top}, ${bottom})`,
              boxShadow: `0 0 14px ${accent}40`,
            }}
            title="Vertical gradient preview: darker tint at roof/top, lighter tint at ground"
          />
          <div>
            <div className="thermal-card-top-meta">
              <h2 className="thermal-card-title">Thermal Heat Exposure</h2>
              <span className="thermal-tint-badge">Top &darr; Bottom Gradient Tint</span>
            </div>
            <p className="thermal-card-status">
              <strong style={{ color: accent }}>{status.label}</strong> &mdash;{" "}
              {status.subtext}
            </p>
          </div>
        </div>

        <div className="thermal-score-display" style={{ borderColor: accent }}>
          <span className="thermal-score-value">{Math.round(value)}</span>
          <span className="thermal-score-unit">/ 100</span>
        </div>
      </div>

      {/* Main Thermal Score Slider */}
      <div className="thermal-slider-control-row">
        <div className="thermal-slider-track-wrap">
          <div className="thermal-slider-labels-header">
            <span className="thermal-control-title">Exposure Score:</span>
            <span className="thermal-gradient-flow-hint">
              Top (Roof): <span className="hint-pill" style={{ backgroundColor: top }}>{top}</span>
              &nbsp;&rarr;&nbsp;
              Bottom (Ground): <span className="hint-pill" style={{ backgroundColor: bottom }}>{bottom}</span>
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={value}
            onChange={(e) => onChange?.(Number(e.target.value))}
            className="thermal-range-input"
            aria-label="Thermal Heat Exposure Score"
          />
          <div className="thermal-spectrum-bar" />
          <div className="thermal-spectrum-labels">
            <span>0 &middot; Cool (Blue)</span>
            <span>25 &middot; Green</span>
            <span>50 &middot; Yellow</span>
            <span>75 &middot; Orange</span>
            <span>100 &middot; Hot (Red)</span>
          </div>
        </div>
      </div>

      {/* Controls Row: Tint Opacity + Jali Intervention Toggle */}
      <div className="thermal-secondary-controls">
        {typeof onOpacityChange === "function" && (
          <div className="thermal-opacity-row">
            <div className="thermal-opacity-label-group">
              <span className="thermal-opacity-label">Tint Opacity:</span>
              <span className="thermal-opacity-val">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="0.9"
              step="0.05"
              value={opacity}
              onChange={(e) => onOpacityChange(Number(e.target.value))}
              className="thermal-opacity-input"
              aria-label="Thermal Tint Opacity"
            />
          </div>
        )}

        {typeof onToggleJali === "function" && (
          <div className="thermal-intervention-toggle-row">
            <span className="thermal-opacity-label">Intervention:</span>
            <button
              type="button"
              className={`jali-toggle-btn ${showJali ? "active" : ""}`}
              onClick={onToggleJali}
              title="Toggle terracotta diamond jali screen visibility"
            >
              <span className="jali-toggle-icon" />
              {showJali ? "3D Terracotta Jali (Active)" : "Jali Screen (Hidden)"}
            </button>
          </div>
        )}
      </div>

      {/* Quick Presets */}
      <div className="thermal-presets-row">
        <span className="thermal-presets-label">Quick Presets:</span>
        <div className="thermal-preset-buttons">
          {presets.map((p) => {
            const isSelected = Math.round(value) === p.score;
            const pGrad = getThermalGradientColors(p.score);
            return (
              <button
                key={p.score}
                type="button"
                className={`thermal-preset-btn ${isSelected ? "active" : ""}`}
                onClick={() => onChange?.(p.score)}
                style={{
                  borderColor: isSelected ? pGrad.accent : undefined,
                  boxShadow: isSelected ? `0 0 0 2px ${pGrad.accent}30` : undefined,
                }}
              >
                <span
                  className="preset-dot"
                  style={{
                    background: `linear-gradient(to bottom, ${pGrad.top}, ${pGrad.bottom})`,
                  }}
                />
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
