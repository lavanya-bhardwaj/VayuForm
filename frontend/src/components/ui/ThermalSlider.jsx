import { getThermalColor, getThermalStatus } from "../../utils/thermal";

export default function ThermalSlider({ value = 100, onChange }) {
  const currentColor = getThermalColor(value);
  const status = getThermalStatus(value);

  const presets = [
    { score: 100, label: "100 · Red (Max Heat)" },
    { score: 75, label: "75 · Orange" },
    { score: 50, label: "50 · Yellow" },
    { score: 25, label: "25 · Green" },
    { score: 0, label: "0 · Blue (Coolest)" },
  ];

  return (
    <div className="thermal-slider-card">
      <div className="thermal-slider-header">
        <div className="thermal-title-group">
          <span className="thermal-badge-indicator" style={{ backgroundColor: currentColor }} />
          <div>
            <h2 className="thermal-card-title">Thermal Heat Exposure</h2>
            <p className="thermal-card-status">
              <strong style={{ color: currentColor }}>{status.label}</strong> &mdash;{" "}
              {status.subtext}
            </p>
          </div>
        </div>

        <div className="thermal-score-display" style={{ borderColor: currentColor }}>
          <span className="thermal-score-value">{Math.round(value)}</span>
          <span className="thermal-score-unit">/ 100</span>
        </div>
      </div>

      <div className="thermal-slider-control-row">
        <div className="thermal-slider-track-wrap">
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
            <span>0 · Cool (Blue)</span>
            <span>25 · Green</span>
            <span>50 · Yellow</span>
            <span>75 · Orange</span>
            <span>100 · Hot (Red)</span>
          </div>
        </div>
      </div>

      <div className="thermal-presets-row">
        <span className="thermal-presets-label">Quick Presets:</span>
        <div className="thermal-preset-buttons">
          {presets.map((p) => {
            const isSelected = Math.round(value) === p.score;
            const pColor = getThermalColor(p.score);
            return (
              <button
                key={p.score}
                type="button"
                className={`thermal-preset-btn ${isSelected ? "active" : ""}`}
                onClick={() => onChange?.(p.score)}
                style={{
                  borderColor: isSelected ? pColor : undefined,
                  boxShadow: isSelected ? `0 0 0 2px ${pColor}40` : undefined,
                }}
              >
                <span
                  className="preset-dot"
                  style={{ backgroundColor: pColor }}
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
