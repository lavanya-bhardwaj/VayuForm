import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { getSunPosition } from "../../utils/sunPosition";
import { climateFor } from "../../engine/climate";
import { BASE_BUILDING_PALETTE, createThermalGradientMaterial, getThermalGradientColors } from "../../utils/thermal";

const STOREY_H = 3.2;
const WALL_T = 0.3;
const SLAB_T = 0.2;
const INTERIOR_SIDE = 16; // interior view scale, metres across
const INTERIOR_COURT = 8; // courtyard width in the interior view, metres
const MAX_FLOORS = 3;
const SILL_H = 0.9;
const LINTEL_H = 2.1;

/** Plan and height of the building, derived from the same inputs the engine uses. */
function layout(building, hasAangan) {
  // The interior view is drawn at a larger fixed scale so the courtyard is big enough to read.
  const side = INTERIOR_SIDE;
  const courtSide = hasAangan ? INTERIOR_COURT : 0;
  const floors = Math.min(MAX_FLOORS, Math.max(1, building.floors));
  return { side, courtSide, floors, H: floors * STOREY_H };
}

function makeMaterials(H) {
  const std = (color, rough = 0.9) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, side: THREE.DoubleSide });
  const wall = createThermalGradientMaterial({
    baseColor: BASE_BUILDING_PALETTE.wall,
    name: "interiorWall",
    minY: 0,
    maxY: H,
  });
  wall.side = THREE.DoubleSide;
  return {
    wall,
    slab: std("#b9b2a5"),
    roof: std("#b9b2a5"),
    roofGreen: std("#4f6e3f"),
    court: std("#d9d2c4"),
    glass: std("#5c6366", 0.2),
    khus: std("#789460", 0.95),
    jali: std("#b5753f", 0.85),
    ground: std("#9aa583", 1),
    bark: std("#6b5844", 0.95),
    leaf: std("#6a8656", 0.95),
    leafDark: std("#5d7a47", 0.95),
    shrub: std("#789460", 0.95),
    soil: std("#4d463f", 1),
  };
}

const blobGeo = new THREE.IcosahedronGeometry(1, 2);

/** Rounded foliage mass, scaled from a unit icosahedron. */
function Blob({ p, r, mat }) {
  return <mesh geometry={blobGeo} material={mat} position={p} scale={r} castShadow receiveShadow />;
}

/** Tree in the courtyard. The trunk starts at the bottom of the sunken bed. */
function CourtTree({ mats }) {
  return (
    <group>
      <Box p={[0, 2.0, 0]} s={[0.25, 4.4, 0.25]} mat={mats.bark} />
      <Blob p={[0, 4.4, 0]} r={1.1} mat={mats.leaf} />
      <Blob p={[0.8, 3.9, 0.3]} r={0.9} mat={mats.leafDark} />
      <Blob p={[-0.7, 4.1, -0.4]} r={0.95} mat={mats.leaf} />
      <Blob p={[0.2, 5.0, -0.2]} r={0.9} mat={mats.leafDark} />
      <Blob p={[-0.3, 3.6, 0.7]} r={0.75} mat={mats.leaf} />
    </group>
  );
}

/** Planter bed sunk below the courtyard floor, with a low concrete rim, shrubs and the tree. */
function SunkenBed({ size, mats }) {
  const rimT = 0.12;
  const rimTop = 0.15;
  const rimH = 0.35;
  const soilTop = -0.2;
  const rimY = rimTop - rimH / 2;
  const h = size / 2;
  return (
    <group>
      <Box p={[0, soilTop - 0.05, 0]} s={[size - 2 * rimT, 0.1, size - 2 * rimT]} mat={mats.soil} />
      <Box p={[0, rimY, h - rimT / 2]} s={[size, rimH, rimT]} mat={mats.slab} />
      <Box p={[0, rimY, -h + rimT / 2]} s={[size, rimH, rimT]} mat={mats.slab} />
      <Box p={[h - rimT / 2, rimY, 0]} s={[rimT, rimH, size - 2 * rimT]} mat={mats.slab} />
      <Box p={[-h + rimT / 2, rimY, 0]} s={[rimT, rimH, size - 2 * rimT]} mat={mats.slab} />
      <Blob p={[-h + 0.35, soilTop + 0.2, h - 0.35]} r={0.3} mat={mats.shrub} />
      <Blob p={[h - 0.35, soilTop + 0.2, -h + 0.35]} r={0.35} mat={mats.shrub} />
      <Blob p={[h - 0.4, soilTop + 0.2, h - 0.4]} r={0.25} mat={mats.leafDark} />
      <CourtTree mats={mats} />
    </group>
  );
}

function Box({ p, s, mat, rotY = 0 }) {
  return (
    <mesh position={p} rotation={[0, rotY, 0]} material={mat} castShadow receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  );
}

/** A slab at height y. With aangan it is a ring around an open courtyard, otherwise a full plate. */
function Slab({ y, side, courtSide, mat }) {
  const hs = side / 2;
  const hc = courtSide / 2;
  if (courtSide === 0) {
    return <Box p={[0, y, 0]} s={[side, SLAB_T, side]} mat={mat} />;
  }
  const strip = (w, d, x, z) => <Box p={[x, y, z]} s={[w, SLAB_T, d]} mat={mat} />;
  return (
    <>
      {strip(side, hs - hc, 0, (hs + hc) / 2)}
      {strip(side, hs - hc, 0, -(hs + hc) / 2)}
      {strip(hs - hc, 2 * hc, -(hs + hc) / 2, 0)}
      {strip(hs - hc, 2 * hc, (hs + hc) / 2, 0)}
    </>
  );
}

/** Exterior walls of one storey, all four sides. */
function ExteriorWalls({ y0, side, mats }) {
  const hs = side / 2;
  const yc = y0 + STOREY_H / 2;
  return (
    <>
      <Box p={[0, yc, hs - WALL_T / 2]} s={[side, STOREY_H, WALL_T]} mat={mats.wall} />
      <Box p={[0, yc, -hs + WALL_T / 2]} s={[side, STOREY_H, WALL_T]} mat={mats.wall} />
      <Box p={[hs - WALL_T / 2, yc, 0]} s={[WALL_T, STOREY_H, side - 2 * WALL_T]} mat={mats.wall} rotY={0} />
      <Box p={[-hs + WALL_T / 2, yc, 0]} s={[WALL_T, STOREY_H, side - 2 * WALL_T]} mat={mats.wall} rotY={0} />
    </>
  );
}

/** One face of the courtyard: sill, window band (khus screen or glass), lintel, and jali bars if applied. */
function CourtWall({ len, y0, mats, showJali, showKhusChik }) {
  const band = LINTEL_H - SILL_H;
  const bandMat = showKhusChik ? mats.khus : mats.glass;
  const bars = 9;
  return (
    <>
      <Box p={[0, y0 + SILL_H / 2, 0]} s={[len, SILL_H, WALL_T]} mat={mats.wall} />
      <Box p={[0, y0 + LINTEL_H + (STOREY_H - LINTEL_H) / 2, 0]} s={[len, STOREY_H - LINTEL_H, WALL_T]} mat={mats.wall} />
      <Box p={[0, y0 + SILL_H + band / 2, WALL_T / 2 + 0.01]} s={[len, band, 0.02]} mat={bandMat} />
      {showJali &&
        Array.from({ length: bars }, (_, i) => (
          <Box
            key={i}
            p={[-len / 2 + ((i + 0.5) * len) / bars, y0 + SILL_H + band / 2, WALL_T / 2 + 0.06]}
            s={[0.06, band, 0.06]}
            mat={mats.jali}
          />
        ))}
    </>
  );
}

/** Four courtyard faces for one storey. The courtyard is open only when aangan is applied. */
function CourtWalls({ y0, courtSide, mats, showJali, showKhusChik }) {
  const hc = courtSide / 2;
  const props = { y0, mats, showJali, showKhusChik, len: courtSide };
  return (
    <>
      <group position={[0, 0, hc]} rotation={[0, Math.PI, 0]}>
        <CourtWall {...props} />
      </group>
      <group position={[0, 0, -hc]}>
        <CourtWall {...props} />
      </group>
      <group position={[hc, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <CourtWall {...props} />
      </group>
      <group position={[-hc, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <CourtWall {...props} />
      </group>
    </>
  );
}

function Scene({ building, hasAangan, showJali, showKhusChik, hasGreenRoof, mats, sunHour }) {
  const { side, courtSide, floors, H } = useMemo(() => layout(building, hasAangan), [building, hasAangan]);
  const sun = getSunPosition(sunHour, climateFor(building.site).site);

  return (
    <>
      <hemisphereLight args={["#e8eef5", "#b0a692", 1.2]} />
      <ambientLight intensity={0.3} />
      {sun && (
        <directionalLight
          position={[sun.x, sun.y, sun.z]}
          intensity={sun.altitude > 0.3 ? 2.0 : 0.5}
          color="#fff6ea"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-camera-near={1}
          shadow-camera-far={60}
          shadow-normalBias={0.03}
        />
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow material={mats.ground}>
        <planeGeometry args={[60, 60]} />
      </mesh>

      {Array.from({ length: floors }, (_, f) => {
        const y0 = f * STOREY_H;
        return (
          <group key={f}>
            <Slab y={y0} side={side} courtSide={courtSide} mat={mats.slab} />
            <ExteriorWalls y0={y0} side={side} mats={mats} />
            {courtSide > 0 && (
              <CourtWalls y0={y0} courtSide={courtSide} mats={mats} showJali={showJali} showKhusChik={showKhusChik} />
            )}
          </group>
        );
      })}

      <Slab y={H} side={side} courtSide={courtSide} mat={hasGreenRoof ? mats.roofGreen : mats.roof} />
      {courtSide > 0 && <Box p={[0, -0.05, 0]} s={[courtSide - 2 * WALL_T, 0.1, courtSide - 2 * WALL_T]} mat={mats.court} />}
      {courtSide > 0 && <SunkenBed size={courtSide * 0.5} mats={mats} />}
      <OrbitControls target={[0, 1.5, 0]} enablePan={false} minDistance={4} maxDistance={40} />
    </>
  );
}

/**
 * Walk-in view of the aangan house. The camera stands at the edge of the courtyard and looks up.
 */
export default function AanganInterior({
  building,
  hasAangan = false,
  showJali = false,
  showKhusChik = false,
  hasGreenRoof = false,
  thermalScore = 100,
  tintOpacity = 0.58,
  sunHour = 12,
}) {
  const { H } = useMemo(() => layout(building, hasAangan), [building, hasAangan]);
  const mats = useMemo(() => makeMaterials(H), [H]);

  useEffect(() => {
    const { top, bottom } = getThermalGradientColors(thermalScore);
    mats.wall.updateThermal(top, bottom, tintOpacity);
  }, [thermalScore, tintOpacity, mats]);

  // Elevated overview: looks down into the open courtyard from outside the house.
  const camera = { position: [11, 11, 15], fov: 50, near: 0.1, far: 300 };

  return (
    <div style={{ width: "100%", height: "100%", background: "#d8e1e8" }}>
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={camera}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
      >
        <color attach="background" args={["#d8e1e8"]} />
        <Scene
          building={building}
          hasAangan={hasAangan}
          showJali={showJali}
          showKhusChik={showKhusChik}
          hasGreenRoof={hasGreenRoof}
          mats={mats}
          sunHour={sunHour}
        />
      </Canvas>
    </div>
  );
}
