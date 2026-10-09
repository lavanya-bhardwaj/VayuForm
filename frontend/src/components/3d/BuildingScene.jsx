import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BASE_BUILDING_PALETTE,
  createThermalGradientMaterial,
  getThermalGradientColors,
} from "../../utils/thermal";
import {
  BuildingPaletteContext,
  useBuildingPalette,
} from "../../context/BuildingPaletteContext";
import Jali from "./interventions/Jali";

/* ==========================================================================
   VAYUFORM – BASE BUILDING MODEL
   Units are metres. +Z is the front facade, +X is to the right of it.
   Origin sits at the centre of the footprint, on the plinth (ground floor = y 0).

   Facade layout (looking at the front):
     LEFT BAY  – flush front wall, two top-floor windows, blank first-floor wall
                 (this is where the jali will be dropped), entrance door below.
     RIGHT BAY – recessed wall with balcony doors, two balconies, carport below.
   ========================================================================== */

/* -------------------- DIMENSIONS -------------------- */

const X_LEFT = -5.0; //   left wall
const X_RIGHT = 5.0; //   right wall
const X_BAY = 0.87; //    where the flush left bay ends and the recessed right bay begins
const Z_FRONT = 3.75; //  left-bay front wall
const Z_BACK = -3.75; //  back wall
const Z_RECESS = 1.85; // right-bay wall (recessed behind the left bay)

const FLOOR_1 = 3.1; //   top of first-floor slab
const FLOOR_2 = 5.9; //   top of second-floor slab
const ROOF = 8.7; //      top of roof slab
const PARAPET = 0.75;

const CARPORT_FRONT = 5.6; // front edge of the carport slab

/* -------------------- SHARED GEOMETRY / MATERIAL HELPERS --------------------
   One unit cube + cached materials, resized with `scale`. Keeps the JSX short
   and means we don't create hundreds of separate geometries.               */

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitBlob = new THREE.IcosahedronGeometry(1, 2);
const matCache = new Map();

function getMat(color, rough = 0.88, metal = 0) {
  const key = `${color}|${rough}|${metal}`;
  if (!matCache.has(key)) {
    matCache.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
    );
  }
  return matCache.get(key);
}

// p = centre position, s = size [x, y, z]
function Box({ p, s, color, material, rough, metal, rot, cast = true, receive = true }) {
  const effectiveMat =
    material ||
    (color instanceof THREE.Material
      ? color
      : getMat(color, rough, metal));

  return (
    <mesh
      geometry={unitBox}
      material={effectiveMat}
      position={p}
      scale={s}
      rotation={rot}
      castShadow={cast}
      receiveShadow={receive}
    />
  );
}

/* -------------------- WINDOW --------------------
   Sits on the wall surface: local +Z points out of the wall.
   `p` is the centre of the opening. Rotate the group to put it on other faces. */

function Window({ p, w = 1.1, h = 1.45, rot = [0, 0, 0], mullion = 0.1, palette }) {
  const contextPalette = useBuildingPalette();
  const pal = palette || contextPalette;
  const t = 0.075; // frame thickness
  return (
    <group position={p} rotation={rot}>
      {/* glass */}
      <Box p={[0, 0, 0.02]} s={[w, h, 0.04]} color={pal.glass} rough={0.2} metal={0.05} cast={false} />
      {/* frame */}
      <Box p={[0, h / 2 - t / 2, 0.05]} s={[w, t, 0.1]} color={pal.frame} rough={0.4} />
      <Box p={[0, -h / 2 + t / 2, 0.05]} s={[w, t, 0.1]} color={pal.frame} rough={0.4} />
      <Box p={[-w / 2 + t / 2, 0, 0.05]} s={[t, h, 0.1]} color={pal.frame} rough={0.4} />
      <Box p={[w / 2 - t / 2, 0, 0.05]} s={[t, h, 0.1]} color={pal.frame} rough={0.4} />
      {/* vertical mullion */}
      <Box p={[w * mullion, 0, 0.05]} s={[0.05, h, 0.09]} color={pal.frame} rough={0.4} />
      {/* sill: receives the thermal wall-light gradient tint */}
      <Box p={[0, -h / 2 - 0.04, 0.1]} s={[w + 0.2, 0.06, 0.2]} material={pal.wallLightMat} />
    </group>
  );
}

/* -------------------- RAILING --------------------
   Runs along local X, centred on `p`, base of the railing at p.y.            */

function Railing({ p, length, height = 1.05, rot = [0, 0, 0], topColor, palette }) {
  const contextPalette = useBuildingPalette();
  const pal = palette || contextPalette;
  const effectiveTopColor = topColor || pal.frame;
  const count = Math.round(length / 0.125);
  const bars = [];
  for (let i = 0; i <= count; i++) {
    bars.push(
      <Box
        key={i}
        p={[-length / 2 + (i / count) * length, height / 2, 0]}
        s={[0.022, height, 0.022]}
        color={pal.frame}
        rough={0.5}
        metal={0.3}
        receive={false}
      />
    );
  }
  return (
    <group position={p} rotation={rot}>
      <Box p={[0, height, 0]} s={[length, 0.06, 0.08]} color={effectiveTopColor} rough={0.5} />
      <Box p={[0, 0.08, 0]} s={[length, 0.05, 0.05]} color={pal.frame} rough={0.5} />
      <Box p={[-length / 2, height / 2, 0]} s={[0.05, height, 0.05]} color={pal.frame} rough={0.5} />
      <Box p={[length / 2, height / 2, 0]} s={[0.05, height, 0.05]} color={pal.frame} rough={0.5} />
      {bars}
    </group>
  );
}

/* -------------------- MAIN WALLS -------------------- */

function Walls({ palette }) {
  const contextPalette = useBuildingPalette();
  const pal = palette || contextPalette;
  const wallTop = ROOF - 0.4;
  return (
    <group>
      {/* Left bay – full depth, flush front (thermal gradient tint) */}
      <Box
        p={[(X_LEFT + X_BAY) / 2, wallTop / 2, (Z_FRONT + Z_BACK) / 2]}
        s={[X_BAY - X_LEFT, wallTop, Z_FRONT - Z_BACK]}
        material={pal.wallMat}
      />
      {/* Right bay – stops at the recessed wall (thermal gradient tint) */}
      <Box
        p={[(X_BAY + X_RIGHT) / 2, wallTop / 2, (Z_RECESS + Z_BACK) / 2]}
        s={[X_RIGHT - X_BAY, wallTop, Z_RECESS - Z_BACK]}
        material={pal.wallMat}
      />
    </group>
  );
}

/* -------------------- LEFT BAY FACADE -------------------- */

function LeftBayFacade({ palette }) {
  const contextPalette = useBuildingPalette();
  const pal = palette || contextPalette;
  const zf = Z_FRONT;
  return (
    <group>
      {/* tall corner fin (dark structural charcoal) */}
      <Box p={[-4.93, 4.65, zf + 0.2]} s={[0.33, 9.3, 0.5]} color={pal.charcoal} />

      {/* light pilasters framing the bay (thermal wall-light gradient tint) */}
      <Box p={[-3.85, 4.15, zf + 0.02]} s={[0.4, 8.3, 0.04]} material={pal.wallLightMat} />
      <Box p={[0.66, 4.15, zf + 0.02]} s={[0.42, 8.3, 0.04]} material={pal.wallLightMat} />
      {/* light strip between the two top-floor windows */}
      <Box p={[-1.355, 7.3, zf + 0.02]} s={[0.8, 1.95, 0.04]} material={pal.wallLightMat} />

      {/* dark free-standing column that frames the jali zone */}
      <Box p={[-3.47, 3.3, zf + 0.15]} s={[0.33, 6.6, 0.3]} color={pal.charcoal} />
      {/* small timber patch at the foot of that column */}
      <Box p={[-3.47, 1.45, zf + 0.31]} s={[0.27, 0.95, 0.03]} color={pal.wood} />

      {/* first-floor slab edge (dark band) */}
      <Box p={[(-4.77 + X_BAY) / 2, 3.075, zf + 0.1]} s={[X_BAY + 4.77, 0.35, 0.22]} color={pal.charcoal} />

      {/* ledge under the top-floor windows */}
      <Box p={[-1.4, 6.35, zf + 0.08]} s={[4.5, 0.1, 0.16]} material={pal.wallLightMat} />

      {/* top-floor windows */}
      <Window p={[-2.42, 7.2, zf]} w={1.17} h={1.45} palette={pal} />
      <Window p={[-0.37, 7.2, zf]} w={1.0} h={1.45} palette={pal} />

      {/* ground-floor window */}
      <Window p={[-2.5, 1.65, zf]} w={1.0} h={1.4} palette={pal} />

      {/* entrance: recessed surround + double door */}
      <Box p={[-0.6, 1.28, zf + 0.07]} s={[2.1, 2.56, 0.14]} color={pal.charcoal} />
      <Box p={[-1.03, 1.2, zf + 0.16]} s={[0.84, 2.4, 0.05]} color={pal.door} rough={0.35} metal={0.15} />
      <Box p={[-0.17, 1.2, zf + 0.16]} s={[0.84, 2.4, 0.05]} color={pal.door} rough={0.35} metal={0.15} />
      <Box p={[-0.45, 1.2, zf + 0.2]} s={[0.025, 0.55, 0.03]} color={pal.steel} rough={0.3} metal={0.7} />
      {/* entrance canopy */}
      <Box p={[-0.54, 2.68, zf + 0.5]} s={[2.83, 0.25, 1.0]} color={pal.taupe} />
      {/* steps */}
      <Box p={[-0.6, 0.06, zf + 0.55]} s={[2.1, 0.12, 0.9]} color="#c3bdb1" />
      <Box p={[-0.6, 0.03, zf + 1.05]} s={[2.1, 0.06, 0.5]} color="#c9c3b7" />

      {/* planter + tree */}
      <Box p={[-4.2, 0.25, zf + 1.6]} s={[1.85, 0.5, 0.95]} color={pal.planter} />
      <Tree p={[-4.2, 0.5, zf + 1.6]} s={1} trunk={0.12} low />
    </group>
  );
}

/* -------------------- RIGHT BAY: BALCONIES + CARPORT -------------------- */

function RightBayFacade({ palette }) {
  const contextPalette = useBuildingPalette();
  const pal = palette || contextPalette;
  const wallZ = Z_RECESS;
  const slabFront = Z_FRONT; // balcony slabs reach the plane of the left bay
  const balconyWidth = X_RIGHT - X_BAY;
  const balconyDepth = slabFront - wallZ;

  return (
    <group>
      {/* ---- Second-floor balcony ---- */}
      <Box
        p={[(X_BAY + X_RIGHT) / 2, FLOOR_2 - 0.15, (wallZ + slabFront) / 2]}
        s={[balconyWidth, 0.3, balconyDepth]}
        color={pal.charcoal}
      />
      {/* light top lip on the slab edge */}
      <Box
        p={[(X_BAY + X_RIGHT) / 2, FLOOR_2 - 0.09, slabFront]}
        s={[balconyWidth, 0.18, 0.1]}
        material={pal.wallLightMat}
      />
      
      {/* Front Railing */}
      <Railing p={[2.85, FLOOR_2, slabFront - 0.1]} length={3.8} topColor="#9a6b44" palette={pal} />
      
      {/* Left & Right Side Railings (Second Floor) */}
      <Railing
        p={[X_BAY + 0.1, FLOOR_2, (wallZ + slabFront) / 2]}
        length={balconyDepth}
        rot={[0, Math.PI / 2, 0]}
        topColor="#9a6b44"
        palette={pal}
      />
      <Railing
        p={[X_RIGHT - 0.1, FLOOR_2, (wallZ + slabFront) / 2]}
        length={balconyDepth}
        rot={[0, Math.PI / 2, 0]}
        topColor="#9a6b44"
        palette={pal}
      />

      {/* ---- First-floor slab = carport roof / first-floor balcony ---- */}
      <Box
        p={[(X_BAY + 6.3) / 2, FLOOR_1 - 0.25, (wallZ + CARPORT_FRONT) / 2]}
        s={[6.3 - X_BAY, 0.5, CARPORT_FRONT - wallZ]}
        color={pal.charcoal}
      />
      
      {/* Front Railing */}
      <Railing p={[2.85, FLOOR_1, slabFront - 0.1]} length={3.8} palette={pal} />

      {/* Left & Right Side Railings (First Floor) */}
      <Railing
        p={[X_BAY + 0.1, FLOOR_1, (wallZ + slabFront) / 2]}
        length={balconyDepth}
        rot={[0, Math.PI / 2, 0]}
        palette={pal}
      />
      <Railing
        p={[X_RIGHT - 0.1, FLOOR_1, (wallZ + slabFront) / 2]}
        length={balconyDepth}
        rot={[0, Math.PI / 2, 0]}
        palette={pal}
      />

      {/* ---- Enclose Recessed Inner Wall (thermal gradient tint) ---- */}
      <Box
        p={[X_BAY, (ROOF - 0.4) / 2, (Z_FRONT + Z_RECESS) / 2]}
        s={[0.2, ROOF - 0.4, Z_FRONT - Z_RECESS]}
        material={pal.wallMat}
      />

      {/* ---- Balcony doors (floors 1 and 2) ---- */}
      <Window p={[1.6, FLOOR_2 + 1.1, wallZ]} w={1.0} h={2.0} palette={pal} />
      <Window p={[3.25, FLOOR_2 + 1.1, wallZ]} w={1.05} h={2.0} palette={pal} />
      <Window p={[1.6, FLOOR_1 + 1.1, wallZ]} w={1.0} h={2.0} palette={pal} />
      <Window p={[3.25, FLOOR_1 + 1.1, wallZ]} w={1.05} h={2.0} palette={pal} />

      {/* ---- Carport (ground floor) ---- */}
      <Window p={[1.96, 1.5, wallZ]} w={1.68} h={1.6} mullion={0.0} palette={pal} />
      {/* floor of carport */}
      <Box p={[3.6, 0.006, (wallZ + CARPORT_FRONT) / 2 + 0.1]} s={[5.4, 0.012, CARPORT_FRONT - wallZ]} color={pal.carportFloor} cast={false} />
      {/* front columns */}
      <Box p={[1.41, 1.28, CARPORT_FRONT - 0.25]} s={[0.36, 2.56, 0.36]} color={pal.charcoal} />
      <Box p={[5.67, 1.28, CARPORT_FRONT - 0.25]} s={[0.3, 2.56, 0.3]} color={pal.charcoal} />

      {/* ---- Tall dark column through the right bay ---- */}
      <Box p={[4.6, 4.5, wallZ + 0.2]} s={[0.3, 9.0, 0.4]} color={pal.charcoal} />

      {/* ---- Small balcony end posts (left end) ---- */}
      <Box p={[0.98, FLOOR_2 + 0.5, slabFront - 0.1]} s={[0.12, 1.0, 0.12]} color={pal.charcoal} />
    </group>
  );
}

/* -------------------- SIDE & BACK FACES -------------------- */

function SideAndBackFaces({ palette }) {
  const contextPalette = useBuildingPalette();
  const pal = palette || contextPalette;
  const levels = [1.65, FLOOR_1 + 1.5, FLOOR_2 + 1.5];
  const slats = [];
  for (let i = 0; i < 9; i++) {
    slats.push(
      <Box
        key={i}
        p={[X_LEFT - 0.04, 4.35, 0.6 + (i + 1) * 0.23]}
        s={[0.02, 7.7, 0.025]}
        color={pal.woodDark}
        receive={false}
      />
    );
  }

  return (
    <group>
      {/* LEFT FACE (-X): timber strip near the front corner, windows near the back */}
      <Box p={[X_LEFT - 0.025, 4.35, 1.75]} s={[0.05, 7.7, 2.3]} color={pal.wood} />
      {slats}
      {levels.map((y) => (
        <Window key={`l${y}`} p={[X_LEFT, y, -2.75]} w={0.95} h={1.4} rot={[0, -Math.PI / 2, 0]} palette={pal} />
      ))}
      {/* first-floor slab edge wrapping the left face */}
      <Box p={[X_LEFT - 0.06, 3.075, 0]} s={[0.12, 0.35, Z_FRONT - Z_BACK]} color={pal.charcoal} />

      {/* RIGHT FACE (+X) */}
      {levels.map((y) => (
        <Window key={`r${y}`} p={[X_RIGHT, y, -1.2]} w={1.0} h={1.4} rot={[0, Math.PI / 2, 0]} palette={pal} />
      ))}

      {/* BACK FACE (-Z) */}
      {levels.map((y) =>
        [-3.0, 0.2, 3.2].map((x) => (
          <Window key={`b${y}${x}`} p={[x, y, Z_BACK]} w={1.2} h={1.4} rot={[0, Math.PI, 0]} palette={pal} />
        ))
      )}
    </group>
  );
}

/* -------------------- ROOF -------------------- */

function Roof({ palette }) {
  const contextPalette = useBuildingPalette();
  const pal = palette || contextPalette;
  const y = ROOF - 0.2;
  const py = ROOF + PARAPET / 2;
  const pt = 0.2; // parapet thickness

  return (
    <group>
      {/* cornice slabs (dark): overhang on the left bay, short overhang on the right bay */}
      <Box p={[(-5.25 + X_BAY) / 2, y, (4.3 - 3.95) / 2]} s={[X_BAY + 5.25, 0.4, 4.3 + 3.95]} color={pal.charcoal} />
      <Box p={[(X_BAY + 5.25) / 2, y, (2.45 - 3.95) / 2]} s={[5.25 - X_BAY, 0.4, 2.45 + 3.95]} color={pal.charcoal} />

      {/* roof deck (subtle solar thermal wash) */}
      <Box p={[0, ROOF + 0.01, -0.7]} s={[10.3, 0.03, 7.4]} material={pal.roofDeckMat} cast={false} />

      {/* parapet – follows the stepped footprint (thermal wall gradient tint) */}
      <Box p={[-0.1, py, 4.15]} s={[10.1 - 4.2 + 0.1, PARAPET, pt]} material={pal.wallMat} /> {/* front, left bay */}
      <Box p={[0, py, -3.85]} s={[10.4, PARAPET, pt]} material={pal.wallMat} /> {/* back */}
      <Box p={[-5.1, py, 0.15]} s={[pt, PARAPET, 8.0]} material={pal.wallMat} /> {/* left */}
      <Box p={[5.15, py, -0.8]} s={[pt, PARAPET, 6.3]} material={pal.wallMat} /> {/* right */}
      <Box p={[3.0, py, 2.3]} s={[4.3, PARAPET, pt]} material={pal.wallMat} /> {/* front, right bay */}
      <Box p={[X_BAY, py, 3.2]} s={[pt, PARAPET, 1.9]} material={pal.wallMat} /> {/* step between bays */}

      {/* coping caps */}
      <Box p={[-2.1, ROOF + PARAPET + 0.03, 4.15]} s={[6.1, 0.06, 0.3]} material={pal.wallLightMat} />
      <Box p={[3.0, ROOF + PARAPET + 0.03, 2.3]} s={[4.4, 0.06, 0.3]} material={pal.wallLightMat} />

      {/* stair-head room */}
      <Box p={[0.3, ROOF + 1.1, -0.95]} s={[2.8, 2.2, 2.5]} material={pal.wallMat} />
      <Box p={[0.3, ROOF + 2.23, -0.95]} s={[2.95, 0.07, 2.65]} material={pal.wallLightMat} />
      <Box p={[1.7, ROOF + 0.65, 0.0]} s={[2.8, 1.3, 2.2]} material={pal.wallLightMat} />
      <Box p={[1.7, ROOF + 1.33, 0.0]} s={[2.95, 0.07, 2.35]} material={pal.wallLightMat} />
    </group>
  );
}

/* -------------------- TREES -------------------- */

const LEAF = ["#6a8656", "#5d7a47", "#789460"];

function Tree({ p, s = 1, trunk = 1.1, low = false }) {
  const blobs = low
    ? [
        [0, trunk + 0.5, 0, 0.62, 0],
        [0.5, trunk + 0.4, 0.1, 0.45, 1],
        [-0.5, trunk + 0.42, -0.05, 0.48, 2],
        [0.05, trunk + 0.85, 0.05, 0.4, 0],
      ]
    : [
        [0, trunk + 0.75, 0, 0.95, 0],
        [0.55, trunk + 0.55, 0.2, 0.65, 1],
        [-0.55, trunk + 0.6, -0.15, 0.7, 2],
        [0.1, trunk + 1.35, 0.05, 0.65, 0],
        [-0.1, trunk + 0.55, 0.55, 0.6, 1],
      ];
  return (
    <group position={p} scale={s}>
      <Box p={[0, trunk / 2, 0]} s={[0.12, trunk, 0.12]} color="#6b5844" />
      {blobs.map(([x, y, z, r, c], i) => (
        <mesh
          key={i}
          geometry={unitBlob}
          material={getMat(LEAF[c], 0.95)}
          position={[x, y, z]}
          scale={r}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}

/* -------------------- GROUND -------------------- */

function Ground({ palette }) {
  const contextPalette = useBuildingPalette();
  const pal = palette || contextPalette;
  const joints = [];
  [4.8, 6.3, 7.8].forEach((z, i) =>
    joints.push(<Box key={`z${i}`} p={[0.5, 0.004, z]} s={[19, 0.008, 0.03]} color={pal.joint} cast={false} />)
  );
  [-7, -4.5, -2, 0.5, 3, 5.5, 8].forEach((x, i) =>
    joints.push(<Box key={`x${i}`} p={[x, 0.004, 6.1]} s={[0.03, 0.008, 4.2]} color={pal.joint} cast={false} />)
  );

  return (
    <group>
      {/* grass + road */}
      <mesh position={[0, -0.32, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={pal.grass} roughness={1} />
      </mesh>
      <mesh position={[0, -0.31, 19.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[600, 18]} />
        <meshStandardMaterial color={pal.road} roughness={0.95} />
      </mesh>

      {/* raised plinth / pavement – dark sides, light top */}
      <mesh position={[0.5, -0.15, 1.65]} receiveShadow castShadow>
        <boxGeometry args={[19, 0.3, 14.3]} />
        <meshStandardMaterial attach="material-0" color={pal.plinthSide} roughness={0.9} />
        <meshStandardMaterial attach="material-1" color={pal.plinthSide} roughness={0.9} />
        <meshStandardMaterial attach="material-2" color={pal.plinthTop} roughness={0.9} />
        <meshStandardMaterial attach="material-3" color={pal.plinthSide} roughness={0.9} />
        <meshStandardMaterial attach="material-4" color={pal.plinthSide} roughness={0.9} />
        <meshStandardMaterial attach="material-5" color={pal.plinthSide} roughness={0.9} />
      </mesh>
      {joints}
    </group>
  );
}

function Landscape() {
  return (
    <group>
      <Tree p={[-15, 0, -10]} s={1.7} trunk={1.5} />
      <Tree p={[-20, 0, -3]} s={1.5} trunk={1.4} />
      <Tree p={[14, 0, -9]} s={1.6} trunk={1.4} />
      <Tree p={[19, 0, -1]} s={1.4} trunk={1.3} />
      <Tree p={[-6, 0, -16]} s={1.9} trunk={1.6} />
      <Tree p={[7, 0, -17]} s={1.8} trunk={1.5} />
    </group>
  );
}

/* -------------------- SKY -------------------- */

function SkyDome() {
  const geometry = useMemo(() => {
    const g = new THREE.SphereGeometry(400, 32, 24);
    const pos = g.attributes.position;
    const horizon = new THREE.Color("#d8e1e8");
    const zenith = new THREE.Color("#a3bbd1");
    const colors = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp(pos.getY(i) / 400, 0, 1);
      c.copy(horizon).lerp(zenith, Math.pow(t, 0.6));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, []);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

/* -------------------- BUILDING -------------------- */

export function Building({ palette }) {
  const contextPalette = useBuildingPalette();
  const pal = palette || contextPalette;

  return (
    <group>
      <Walls palette={pal} />
      <LeftBayFacade palette={pal} />
      <RightBayFacade palette={pal} />
      <SideAndBackFaces palette={pal} />
      <Roof palette={pal} />
    </group>
  );
}

/* -------------------- SCENE -------------------- */

export default function BuildingScene({
  thermalScore = 100,
  tintOpacity = 0.58,
  showJali = true,
  jaliProps,
}) {
  const [selectedJali, setSelectedJali] = useState(false);
  // Create gradient materials once
  const thermalMaterials = useMemo(() => {
    const wallMat = createThermalGradientMaterial({
      baseColor: BASE_BUILDING_PALETTE.wall,
      roughness: 0.88,
      name: "wall",
      minY: 0.0,
      maxY: 9.5,
    });
    const wallLightMat = createThermalGradientMaterial({
      baseColor: BASE_BUILDING_PALETTE.wallLight,
      roughness: 0.88,
      name: "wallLight",
      minY: 0.0,
      maxY: 9.5,
    });
    const roofDeckMat = createThermalGradientMaterial({
      baseColor: BASE_BUILDING_PALETTE.roofDeck,
      roughness: 0.95,
      name: "roofDeck",
      minY: 0.0,
      maxY: 9.5,
    });
    return { wallMat, wallLightMat, roofDeckMat };
  }, []);

  // Live uniform updates when thermalScore or tintOpacity moves
  useEffect(() => {
    const { top, bottom } = getThermalGradientColors(thermalScore);
    thermalMaterials.wallMat.updateThermal(top, bottom, tintOpacity);
    thermalMaterials.wallLightMat.updateThermal(top, bottom, tintOpacity * 0.9);
    thermalMaterials.roofDeckMat.updateThermal(top, bottom, tintOpacity * 0.85);
  }, [thermalScore, tintOpacity, thermalMaterials]);

  const palette = useMemo(() => {
    return {
      ...BASE_BUILDING_PALETTE,
      wallMat: thermalMaterials.wallMat,
      wallLightMat: thermalMaterials.wallLightMat,
      roofDeckMat: thermalMaterials.roofDeckMat,
    };
  }, [thermalMaterials]);

  return (
    <div style={{ width: "100%", height: "650px", background: "#d8e1e8", position: "relative" }}>
      <Canvas shadows="percentage" 
        onPointerMissed={() => setSelectedJali(false)}
        dpr={[1, 2]}
        camera={{ position: [-10, 3.0, 28.5], fov: 30, near: 0.1, far: 1000 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
      >
        <BuildingPaletteContext.Provider value={palette}>
          <SkyDome />
          <fog attach="fog" args={["#d8e1e8", 60, 170]} />

          {/* soft sky/ground bounce + a warm key light */}
          <hemisphereLight args={["#e8eef5", "#b0a692", 1.45]} />
          <ambientLight intensity={0.25} />
          <directionalLight
            position={[9, 16, 15]}
            intensity={2.0}
            color="#fff6ea"
            castShadow
            shadow-mapSize={[4096, 4096]}
            shadow-camera-near={1}
            shadow-camera-far={60}
            shadow-camera-left={-16}
            shadow-camera-right={16}
            shadow-camera-top={16}
            shadow-camera-bottom={-16}
            shadow-bias={-0.0004}
            shadow-normalBias={0.03}
          />
          {/* gentle fill so the left face never goes muddy */}
          <directionalLight position={[-14, 7, 9]} intensity={0.55} color="#f2f5ff" />

          <Ground palette={palette} />
          <Landscape />
          <Building palette={palette} />

          {/* First Passive-Cooling Retrofit Intervention: Terracotta Diamond Jali Screen */}
          {showJali && (
            <Jali 
            {...jaliProps} 
            position={[-2.42, 5.25, 4.19]} 
            width={3.0} 
            height={4.7} 
            depth={0.18} 
            density={0.55} 
            wallZ={Z_FRONT} 
            selected={selectedJali} 
            onSelect={() => setSelectedJali(true)} 
            />
          )}

          <OrbitControls
          target={[0.4, 4.9, 0]}
          enablePan={!selectedJali}
          enableRotate={!selectedJali}
          enableZoom={!selectedJali}
          minDistance={8}
          maxDistance={45}
          minPolarAngle={Math.PI / 5}
          maxPolarAngle={Math.PI / 2.05}
          />
        </BuildingPaletteContext.Provider>
      </Canvas>
    </div>
  );
}