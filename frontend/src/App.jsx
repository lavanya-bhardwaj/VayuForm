import { useState } from "react";
import BuildingScene from "./components/3d/BuildingScene";
import ThermalSlider from "./components/ui/ThermalSlider";
import "./App.css";

function App() {
  // thermalScore: 100 = very hot / red (default start), 0 = coolest / blue
  const [thermalScore, setThermalScore] = useState(100);
  // tintOpacity: 0.58 = soft, non-opaque architectural tint over base wall
  const [tintOpacity, setTintOpacity] = useState(0.58);
  // showJali: active state for the first passive-cooling intervention
  const [showJali, setShowJali] = useState(true);

  return (
    <div className="vayu-app">
      <header className="vayu-header">
        <div className="vayu-header-badge">Step 2 &middot; Passive-Cooling Intervention</div>
        <h1 className="vayu-title">VayuForm</h1>
        <p className="vayu-subtitle">
          AI-Assisted Passive-Cooling Retrofit Simulator &middot; Terracotta Diamond Jali Screen
        </p>
      </header>

      <main className="vayu-main">
        {/* Thermal controls: Score slider + Jali Intervention Toggle */}
        <ThermalSlider
          value={thermalScore}
          onChange={setThermalScore}
          opacity={tintOpacity}
          onOpacityChange={setTintOpacity}
          showJali={showJali}
          onToggleJali={() => setShowJali((prev) => !prev)}
        />

        {/* 3D Building Scene with live gradient tint + 3D Jali Intervention */}
        <section className="vayu-viewport-container">
          <BuildingScene
            thermalScore={thermalScore}
            tintOpacity={tintOpacity}
            showJali={showJali}
          />
        </section>
      </main>
    </div>
  );
}

export default App;