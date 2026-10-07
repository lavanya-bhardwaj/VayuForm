import { useState } from "react";
import BuildingScene from "./components/3d/BuildingScene";
import ThermalSlider from "./components/ui/ThermalSlider";
import "./App.css";

function App() {
  // thermalScore: 100 = very hot / red (default start), 0 = coolest / blue
  const [thermalScore, setThermalScore] = useState(100);

  return (
    <div className="vayu-app">
      <header className="vayu-header">
        <div className="vayu-header-badge">Step 1 &middot; Thermal Heat Exposure</div>
        <h1 className="vayu-title">VayuForm</h1>
        <p className="vayu-subtitle">
          AI-Assisted Passive-Cooling Retrofit Simulator
        </p>
      </header>

      <main className="vayu-main">
        {/* Temporary control: manual thermal exposure slider */}
        <ThermalSlider
          value={thermalScore}
          onChange={setThermalScore}
        />

        {/* 3D Building Scene with live thermal material mapping */}
        <section className="vayu-viewport-container">
          <BuildingScene thermalScore={thermalScore} />
        </section>
      </main>
    </div>
  );
}

export default App;