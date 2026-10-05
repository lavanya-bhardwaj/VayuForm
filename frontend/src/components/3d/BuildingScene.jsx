
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

/* -------------------- MATERIALS -------------------- */

const WALL = "#f8e7cb";
const WALL_LIGHT = "#beab8b";
const WALL_DARK = "#a29a8d";
const WALL_RECESS = "#aaa39a";

// const GLASS = "#817c7c";
const FRAME = "#3f4142";
const BALCONY = "#c9c2b8";

const GROUND = "#77746e";

/* -------------------- WINDOW -------------------- */

function Window({
  position,
  width = 1.25,
  height = 1.55,
  rotation = [0, 0, 0],
  large = false,
  glassColor = "#5a5858",
}) {
  const finalWidth = large ? 2.35 : width;
  const finalHeight = large ? 2.7 : height;

  return (
    <group position={position} rotation={rotation}>
      {/* Dark Frame - recessed back */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[finalWidth + 0.12, finalHeight + 0.12, 0.08]} />
        <meshStandardMaterial color={FRAME} />
      </mesh>

      {/* Glass Pane - MUST BE FORWARD (+0.04) so it's visible */}
      <mesh position={[0, 0, 0.04]}>
        <boxGeometry args={[finalWidth, finalHeight, 0.02]} />
        <meshStandardMaterial
          color={glassColor}
          roughness={0.1}
          metalness={0.1}
          transparent={true}
          opacity={0.8}
        />
      </mesh>
    </group>
  );
}

/* -------------------- BALCONY -------------------- */

function Balcony({ position, width = 3.2, depth = 1.25, rotation = [0, 0, 0] }) {
  const railingHeight = 0.9;
  const barCount = Math.max(3, Math.floor(width / 0.5));
  const bars = [];

  for (let i = 0; i < barCount; i++) {
    const x = -width / 2 + 0.1 + (i / (barCount - 1)) * (width - 0.2);

    bars.push(
      <mesh key={i} position={[x, railingHeight / 2, depth / 2 - 0.04]} castShadow>
        <boxGeometry args={[0.035, railingHeight, 0.035]} />
        <meshStandardMaterial color={FRAME} />
      </mesh>
    );
  }

  return (
    <group position={position} rotation={rotation}>
      {/* Balcony slab */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.18, depth]} />
        <meshStandardMaterial color={BALCONY} />
      </mesh>

      {/* Supporting Brackets under slab */}
      <mesh position={[-width / 3, -0.25, -depth / 4]} castShadow>
        <boxGeometry args={[0.15, 0.35, depth / 2]} />
        <meshStandardMaterial color={WALL_DARK} />
      </mesh>
      <mesh position={[width / 3, -0.25, -depth / 4]} castShadow>
        <boxGeometry args={[0.15, 0.35, depth / 2]} />
        <meshStandardMaterial color={WALL_DARK} />
      </mesh>

      {/* Top Front railing */}
      <mesh position={[0, railingHeight, depth / 2 - 0.04]} castShadow>
        <boxGeometry args={[width, 0.06, 0.06]} />
        <meshStandardMaterial color={FRAME} />
      </mesh>

      {/* Left railing */}
      <mesh position={[-width / 2 + 0.04, railingHeight / 2, 0]} castShadow>
        <boxGeometry args={[0.06, railingHeight, depth]} />
        <meshStandardMaterial color={FRAME} />
      </mesh>

      {/* Right railing */}
      <mesh position={[width / 2 - 0.04, railingHeight / 2, 0]} castShadow>
        <boxGeometry args={[0.06, railingHeight, depth]} />
        <meshStandardMaterial color={FRAME} />
      </mesh>

      {/* Vertical bars */}
      {bars}
    </group>
  );
}

/* -------------------- ENTRANCE -------------------- */

function Entrance() {
  return (
    <group position={[0, 1.2, 3.52]}>
      {/* Dark entrance recess */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.1, 2.4, 0.18]} />
        <meshStandardMaterial color={FRAME} />
      </mesh>

      {/* Door */}
      <mesh position={[0, -0.05, 0.08]} castShadow>
        <boxGeometry args={[1.55, 2.2, 0.06]} />
        <meshStandardMaterial
          color="#303334"
          roughness={0.25}
          metalness={0.2}
        />
      </mesh>

      {/* Door handle */}
      <mesh position={[0.55, -0.05, 0.12]}>
        <boxGeometry args={[0.06, 0.35, 0.04]} />
        <meshStandardMaterial color="#c0b8a8" />
      </mesh>

      {/* Entrance canopy */}
      <mesh position={[0, 1.3, 0.4]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 0.18, 1.0]} />
        <meshStandardMaterial color={WALL_DARK} />
      </mesh>
    </group>
  );
}

/* -------------------- FLOOR DETAILS -------------------- */

/* -------------------- FLOOR DETAILS (ALL 4 SIDES) -------------------- */

function FloorBand({ y }) {
  return (
    <group position={[0, y, 0]}>
      {/* Front Band */}
      <mesh position={[0, 0, 3.56]}>
        <boxGeometry args={[10.3, 0.18, 0.18]} />
        <meshStandardMaterial color={WALL_DARK} />
      </mesh>

      {/* Back Band */}
      <mesh position={[0, 0, -3.56]}>
        <boxGeometry args={[10.3, 0.18, 0.18]} />
        <meshStandardMaterial color={WALL_DARK} />
      </mesh>

      {/* Left Band */}
      <mesh position={[-5.06, 0, 0]}>
        <boxGeometry args={[0.18, 0.18, 7.3]} />
        <meshStandardMaterial color={WALL_DARK} />
      </mesh>

      {/* Right Band */}
      <mesh position={[5.06, 0, 0]}>
        <boxGeometry args={[0.18, 0.18, 7.3]} />
        <meshStandardMaterial color={WALL_DARK} />
      </mesh>
    </group>
  );
}
/* -------------------- SIDE WINDOWS -------------------- */

/* -------------------- LEFT SIDE WINDOWS & BALCONY -------------------- */

function SideWindows() {
  return (
    <group>
      {/* LEFT SIDE */}
      
      {/* Floor 1: Window directly under the balcony */}
      <Window
        position={[-5.02, 1.5, 0.2]}
        rotation={[0, -Math.PI / 2, 0]}
        width={1.2}
        height={1.45}
      />

      {/* Floor 2: Double-width glass entrance opening to the extended balcony */}
      <Window
        position={[-5.02, 4.5, 0.2]}
        rotation={[0, -Math.PI / 2, 0]}
        width={2.8}
        height={2.0}
      />

      {/* Floor 3: Window directly above the balcony */}
      <Window
        position={[-5.02, 7.5, 0.2]}
        rotation={[0, -Math.PI / 2, 0]}
        width={1.2}
        height={1.45}
      />

      {/* RIGHT SIDE */}
      <Window
        position={[5.02, 1.5, 0]}
        rotation={[0, Math.PI / 2, 0]}
        width={1.2}
        height={1.45}
      />
      <Window
        position={[5.02, 4.5, 0]}
        rotation={[0, Math.PI / 2, 0]}
        width={1.2}
        height={1.45}
      />
      <Window
        position={[5.02, 7.5, 0]}
        rotation={[0, Math.PI / 2, 0]}
        width={1.2}
        height={1.45}
      />
    </group>
  );
}

/* -------------------- EXTENDED SIDE BALCONY -------------------- */

function SideBalcony() {
  return (
    <Balcony
      position={[-5.02, 3.5, 0.2]}
      rotation={[0, -Math.PI / 2, 0]}
      width={2.8}                      /* Extended to span two windows */
      depth={1.1}
    />
  );
}


/* -------------------- ROOF -------------------- */

function Roof() {
  return (
    <group>
      {/* Main roof slab */}
      <mesh position={[0, 9.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[10.4, 0.25, 7.4]} />
        <meshStandardMaterial color={WALL_DARK} />
      </mesh>

      {/* Front parapet */}
      <mesh position={[0, 9.55, 3.55]} castShadow receiveShadow>
        <boxGeometry args={[10.4, 0.6, 0.18]} />
        <meshStandardMaterial color={WALL} />
      </mesh>

      {/* Back parapet */}
      <mesh position={[0, 9.55, -3.55]} castShadow receiveShadow>
        <boxGeometry args={[10.4, 0.6, 0.18]} />
        <meshStandardMaterial color={WALL} />
      </mesh>

      {/* Left parapet */}
      <mesh position={[-5.11, 9.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.18, 0.6, 6.9]} />
        <meshStandardMaterial color={WALL} />
      </mesh>

      {/* Right parapet */}
      <mesh position={[5.11, 9.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.18, 0.6, 6.9]} />
        <meshStandardMaterial color={WALL} />
      </mesh>

      {/* Rooftop structure */}
      <mesh position={[2.5, 9.75, -0.8]} castShadow receiveShadow>
        <boxGeometry args={[2.5, 0.9, 2.1]} />
        <meshStandardMaterial color={WALL_LIGHT} />
      </mesh>
    </group>
  );
}

/* -------------------- PARKING / CARPORT -------------------- */

function Carport() {
  return (
    <group position={[2.5, 0, 4.8]}>
      {/* Roof slab attached to facade */}
      <mesh position={[0, 3.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.8, 0.2, 2.6]} />
        <meshStandardMaterial color={WALL_DARK} />
      </mesh>

      {/* Support columns */}
      <mesh position={[-2.1, 1.6, 1.1]} castShadow receiveShadow>
        <boxGeometry args={[0.2, 3.2, 0.2]} />
        <meshStandardMaterial color={FRAME} />
      </mesh>

      <mesh position={[2.1, 1.6, 1.1]} castShadow receiveShadow>
        <boxGeometry args={[0.2, 3.2, 0.2]} />
        <meshStandardMaterial color={FRAME} />
      </mesh>
    </group>
  );
}

/* -------------------- FACADE DETAILS -------------------- */

function FacadeDetails() {
  return (
    <group>
      {/* Left recessed panel */}
      <mesh position={[-3.85, 4.7, 3.52]} castShadow receiveShadow>
        <boxGeometry args={[1.25, 7.7, 0.05]} />
        <meshStandardMaterial color={WALL_RECESS} />
      </mesh>

      {/* Vertical architectural fins */}
      <mesh position={[-4.35, 4.5, 3.65]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 8.8, 0.2]} />
        <meshStandardMaterial color={WALL_DARK} />
      </mesh>

      <mesh position={[4.35, 4.5, 3.65]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 8.8, 0.2]} />
        <meshStandardMaterial color={WALL_DARK} />
      </mesh>
    </group>
  );
}

/* -------------------- BUILDING -------------------- */

function Building() {
  return (
    <group>
      {/* Main building mass */}
      <mesh position={[0, 4.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[10, 9, 7]} />
        <meshStandardMaterial color={WALL} />
      </mesh>

      {/* Floor bands */}
      <FloorBand y={3} />
      <FloorBand y={6} />

      {/* Ground floor windows */}
      <Window position={[-3.2, 1.45, 3.55]} width={1.25} height={1.55} />
      <Window position={[2.85, 1.75, 3.55]} large={true} />

      {/* Upper floor windows */}
      <Window position={[-3.2, 4.45, 3.55]} />
      <Window position={[-1.3, 4.45, 3.55]} />

      {/* Balcony door/window */}
      <Window position={[2.1, 4.45, 3.55]} width={1.35} height={2.0} />

      {/* Top floor windows */}
      <Window position={[-3.2, 7.45, 3.55]} />
      <Window position={[-1.3, 7.45, 3.55]} />
      <Window position={[2.0, 7.45, 3.55]} width={1.55} height={1.75} />

      {/* Front balcony */}
      <Balcony position={[2.1, 3.2, 4.1]} width={3.2} depth={1.1} />

      {/* Side balcony */}
      <SideBalcony />

      {/* Entrance */}
      <Entrance />

      {/* Side windows */}
      <SideWindows />

      {/* Façade details */}
      <FacadeDetails />

      {/* Carport */}
      <Carport />

      {/* Roof */}
      <Roof />
    </group>
  );
}

/* -------------------- GROUND -------------------- */

function Ground() {
  return (
    <group>
      {/* Main ground */}
      <mesh position={[0, -0.15, 0]} receiveShadow>
        <boxGeometry args={[18, 0.3, 15]} />
        <meshStandardMaterial color={GROUND} />
      </mesh>

      {/* Front pavement */}
      <mesh position={[0, 0.01, 5.5]} receiveShadow>
        <boxGeometry args={[18, 0.02, 3]} />
        <meshStandardMaterial color="#a6a29b" />
      </mesh>

      {/* Planter */}
      <mesh position={[-6, 0.2, 2]} castShadow receiveShadow>
        <boxGeometry args={[2, 0.4, 1.5]} />
        <meshStandardMaterial color="#62584e" />
      </mesh>

      {/* Plant */}
      <mesh position={[-6, 0.9, 2]} castShadow>
        <sphereGeometry args={[0.65, 16, 16]} />
        <meshStandardMaterial color="#596b51" />
      </mesh>
    </group>
  );
}

/* -------------------- SCENE -------------------- */

export default function BuildingScene() {
  return (
    <div style={{ width: "100%", height: "650px" }}>
      <Canvas
        shadows
        camera={{
          position: [14, 10, 15],
          fov: 42,
        }}
      >
        {/* Balanced Lighting with Shadows */}
        <ambientLight intensity={0.7} />

        <directionalLight
          position={[12, 18, 10]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.5}
          shadow-camera-far={50}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />

        <directionalLight position={[-8, 8, -5]} intensity={0.4} />

        {/* Scene Components */}
        <Ground />
        <Building />

        {/* Controls */}
        <OrbitControls
          enablePan={true}
          minDistance={7}
          maxDistance={40}
          minPolarAngle={Math.PI / 5}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
    </div>
  );
}