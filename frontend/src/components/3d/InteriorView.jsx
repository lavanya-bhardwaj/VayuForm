import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { getSunPosition } from "../../utils/sunPosition";
import { climateFor } from "../../engine/climate";

// Metres. Storey height and wall sizes match the exterior model.
const STOREY_H = 3.2;
const WALL_T = 0.3;
const SLAB_T = 0.2;
const EYE_H = 1.6;
const COURT_SHARE = 0.15; // same share of the footprint as the engine uses for the aangan
const STAIR = { width: 1.2, steps: 18, maxTread: 0.28 };
const WINDOW = { x0: -1.2, x1: 1.2, y0: 0.9, y1: 2.1 }; // relative to the storey floor
const DOOR = { x0: -1.6, x1: 1.6, y1: 3.0 }; // open arcade onto the courtyard, so the tree can be seen from standing height

/**
 * Splits a rectangle into cells that avoid the holes. Used for walls with openings and slabs with shafts.
 * Rectangles are {a0, a1, b0, b1}. The result is a list of cells that cover the outer rectangle minus the holes.
 */
function cutRects(outer, holes) {
  const edges = (lo, hi, pick) => {
    const values = [lo, hi, ...holes.flatMap((h) => [pick(h, 0), pick(h, 1)])].filter((v) => v >= lo && v <= hi);
    return [...new Set(values)].sort((x, y) => x - y);
  };
  const as = edges(outer.a0, outer.a1, (h, i) => (i ? h.a1 : h.a0));
  const bs = edges(outer.b0, outer.b1, (h, i) => (i ? h.b1 : h.b0));
  const cells = [];
  for (let i = 0; i < as.length - 1; i++) {
    for (let j = 0; j < bs.length - 1; j++) {
      const ca = (as[i] + as[i + 1]) / 2;
      const cb = (bs[j] + bs[j + 1]) / 2;
      const inHole = holes.some((h) => ca > h.a0 && ca < h.a1 && cb > h.b0 && cb < h.b1);
      if (!inHole) cells.push({ a0: as[i], a1: as[i + 1], b0: bs[j], b1: bs[j + 1] });
    }
  }
  return cells;
}

/** Layout of the building in metres, centred on the origin. */
function plan(building, hasAangan) {
  const S = Math.sqrt(building.footprintM2);
  const S2 = S / 2;
  const F = Math.min(5, Math.max(1, building.floors));
  const CS = hasAangan ? S * Math.sqrt(COURT_SHARE) : 0;
  const CS2 = CS / 2;
  const gallery = hasAangan ? (S - CS) / 2 : 0;
  const tread = Math.min(STAIR.maxTread, (S - 2.4) / STAIR.steps);
  const stairZ0 = -S2 + 1.2;
  const stair = hasAangan
    ? { a0: CS2 + 0.4, a1: CS2 + 0.4 + STAIR.width, b0: stairZ0, b1: stairZ0 + STAIR.steps * tread }
    : { a0: S2 - 1.6, a1: S2 - 0.4, b0: stairZ0, b1: stairZ0 + STAIR.steps * tread };
  const court = hasAangan ? [{ a0: -CS2, a1: CS2, b0: -CS2, b1: CS2 }] : [];
  return {
    S,
    S2,
    F,
    H: F * STOREY_H,
    CS,
    CS2,
    tread,
    riser: STOREY_H / STAIR.steps,
    stair,
    court,
    // Standing spot: off-centre, in the room (or in the back gallery when there is an aangan), looking at the front wall.
    eye: hasAangan ? [-S * 0.06, EYE_H, S2 - 1.0] : [-S * 0.18, EYE_H, S2 - 1.8],
    target: hasAangan ? [0, 2.6, 0] : [0, 1.3, -S2],
    frontCenterZ: hasAangan ? -CS2 : -S2 + WALL_T / 2,
  };
}

function Wall({ axis, at, span, y0, h, openings = [], mat }) {
  const cells = cutRects(
    { a0: span[0], a1: span[1], b0: y0, b1: y0 + h },
    openings.map((o) => ({ a0: o.a0, a1: o.a1, b0: o.b0, b1: o.b1 }))
  );
  return (
    <>
      {cells.map((c, i) => {
        const da = c.a1 - c.a0;
        const db = c.b1 - c.b0;
        const ca = (c.a0 + c.a1) / 2;
        const cb = (c.b0 + c.b1) / 2;
        const position = axis === "x" ? [ca, cb, at] : [at, cb, ca];
        const size = axis === "x" ? [da, db, WALL_T] : [WALL_T, db, da];
        return (
          <mesh key={i} position={position} material={mat} castShadow receiveShadow>
            <boxGeometry args={size} />
          </mesh>
        );
      })}
    </>
  );
}

function Slab({ y, S2, holes, thickness = SLAB_T, mat }) {
  const cells = cutRects({ a0: -S2, a1: S2, b0: -S2, b1: S2 }, holes);
  return (
    <>
      {cells.map((c, i) => (
        <mesh
          key={i}
          position={[(c.a0 + c.a1) / 2, y, (c.b0 + c.b1) / 2]}
          material={mat}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[c.a1 - c.a0, thickness, c.b1 - c.b0]} />
        </mesh>
      ))}
    </>
  );
}

/** Stone-step stairs. Each step is a block, so the flight reads as solid and sits on the floor below. */
function Stairs({ base, stair, tread, riser, mat }) {
  return (
    <>
      {Array.from({ length: STAIR.steps }, (_, i) => {
        const h = (i + 1) * riser;
        return (
          <mesh
            key={i}
            position={[(stair.a0 + stair.a1) / 2, base + h / 2, stair.b0 + (i + 0.5) * tread]}
            material={mat}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[stair.a1 - stair.a0, h, tread]} />
          </mesh>
        );
      })}
    </>
  );
}

/**
 * Jali: a solid terracotta screen over the window, pierced with a grid of square openings.
 * Light passes through the holes, so the sun lands on the floor as a pattern of spots.
 */
function Jali({ z, y0, mat }) {
  const pitch = 0.3;
  const hole = pitch * 0.6;
  const holes = [];
  for (let x = WINDOW.x0 + pitch / 2; x < WINDOW.x1 - pitch / 4; x += pitch) {
    for (let y = WINDOW.y0 + pitch / 2; y < WINDOW.y1 - pitch / 4; y += pitch) {
      holes.push({ a0: x - hole / 2, a1: x + hole / 2, b0: y0 + y - hole / 2, b1: y0 + y + hole / 2 });
    }
  }
  const cells = cutRects(
    { a0: WINDOW.x0, a1: WINDOW.x1, b0: y0 + WINDOW.y0, b1: y0 + WINDOW.y1 },
    holes
  );
  const depth = 0.12;
  return (
    <>
      {cells.map((c, i) => (
        <mesh
          key={i}
          position={[(c.a0 + c.a1) / 2, (c.b0 + c.b1) / 2, z]}
          material={mat}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[c.a1 - c.a0, c.b1 - c.b0, depth]} />
        </mesh>
      ))}
    </>
  );
}

/** One storey of walls. The front wall gets the jali opening; the courtyard walls only exist with an aangan. */
function Storey({ f, p, hasJali, hasAangan, mats }) {
  const y0 = f * STOREY_H;
  const jaliOpenings = hasJali ? [{ a0: WINDOW.x0, a1: WINDOW.x1, b0: y0 + WINDOW.y0, b1: y0 + WINDOW.y1 }] : [];
  const doorOpenings = f === 0 && hasAangan ? [{ a0: DOOR.x0, a1: DOOR.x1, b0: y0, b1: y0 + DOOR.y1 }] : [];
  const h = STOREY_H;
  const S2 = p.S2;
  const CS2 = p.CS2;
  const wall = (props) => <Wall key={`${f}-${props.axis}-${props.at}`} y0={y0} h={h} mat={mats.plaster} {...props} />;

  return (
    <>
      {/* Outer shell */}
      {wall({ axis: "z", at: -S2 + WALL_T / 2, span: [-S2, S2] })}
      {wall({ axis: "z", at: S2 - WALL_T / 2, span: [-S2, S2] })}
      {wall({ axis: "x", at: S2 - WALL_T / 2, span: [-S2, S2] })}
      {hasAangan
        ? wall({ axis: "x", at: -S2 + WALL_T / 2, span: [-S2, S2] })
        : wall({ axis: "x", at: -S2 + WALL_T / 2, span: [-S2, S2], openings: jaliOpenings })}
      {/* Courtyard walls */}
      {hasAangan && wall({ axis: "x", at: -CS2, span: [-CS2, CS2], openings: jaliOpenings })}
      {hasAangan && wall({ axis: "x", at: CS2, span: [-CS2, CS2], openings: doorOpenings })}
      {hasAangan && wall({ axis: "z", at: -CS2, span: [-CS2, CS2] })}
      {hasAangan && wall({ axis: "z", at: CS2, span: [-CS2, CS2] })}
      {hasJali && (
        <Jali z={p.frontCenterZ} y0={y0} mat={mats.jali} />
      )}
    </>
  );
}

/** Warm light on the front wall, around the jali. It only shows when the sun is on the front side. */
function SunGlow({ p, strength }) {
  if (strength <= 0) return null;
  const width = WINDOW.x1 - WINDOW.x0 + 0.8;
  const height = WINDOW.y1 - WINDOW.y0 + 0.8;
  return (
    <mesh position={[0, (WINDOW.y0 + WINDOW.y1) / 2, p.frontCenterZ + WALL_T / 2 + 0.01]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        color="#ffcc4d"
        transparent
        opacity={0.55 * strength}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/** Tree in the courtyard, planted in a low bed. Built from blobs so the crown reads as foliage. */
function CourtTree({ mats }) {
  const blob = (p, r, mat) => (
    <mesh position={p} scale={r} material={mat} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 2]} />
    </mesh>
  );
  return (
    <group>
      <mesh position={[0, 0.15, 0]} material={mats.bed} receiveShadow>
        <boxGeometry args={[1.6, 0.3, 1.6]} />
      </mesh>
      <mesh position={[0, 2.5, 0]} material={mats.bark} castShadow>
        <boxGeometry args={[0.25, 4.6, 0.25]} />
      </mesh>
      {blob([0, 5.0, 0], 1.2, mats.leaf)}
      {blob([0.9, 4.5, 0.4], 0.95, mats.leafDark)}
      {blob([-0.8, 4.7, -0.5], 1.0, mats.leaf)}
      {blob([0.2, 5.7, -0.2], 0.9, mats.leafDark)}
      {blob([-0.4, 4.2, 0.8], 0.8, mats.leaf)}
    </group>
  );
}

/** Eye-level look: the camera stays where it is, and dragging turns the head. */
function LookControls({ eye, target }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    camera.position.set(...eye);
    const dx = target[0] - eye[0];
    const dy = target[1] - eye[1];
    const dz = target[2] - eye[2];
    let yaw = Math.atan2(-dx, -dz);
    let pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const apply = () => camera.rotation.set(pitch, yaw, 0, "YXZ");
    apply();

    // Keep the same width of view on tall or narrow panels. Three.js sets the vertical field of view by default.
    const HORIZONTAL_FOV = 1.2; // radians, about 69°
    const fitWidth = () => {
      const aspect = gl.domElement.clientWidth / Math.max(1, gl.domElement.clientHeight);
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(HORIZONTAL_FOV / 2) / aspect));
      camera.updateProjectionMatrix();
    };
    fitWidth();
    window.addEventListener("resize", fitWidth);

    let last = null;
    const onDown = (e) => {
      last = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      last = null;
    };
    const onMove = (e) => {
      if (!last) return;
      yaw -= (e.clientX - last.x) * 0.004;
      pitch = Math.max(-0.7, Math.min(0.7, pitch - (e.clientY - last.y) * 0.003));
      last = { x: e.clientX, y: e.clientY };
      apply();
    };
    const el = gl.domElement;
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", fitWidth);
    };
  }, [camera, gl, eye, target]);
  return null;
}

function Scene({ building, p, hasJali, hasAangan, sunHour, mats }) {
  const site = climateFor(building.site).site;
  const sun = getSunPosition(sunHour, site);
  const sunFactor = sun ? Math.min(1, sun.altitude / 0.9) : 0;
  const glowStrength = hasJali && sun && sun.z < 0 ? sunFactor : 0;

  return (
    <>
      <hemisphereLight args={["#eef4fa", "#b0a58a", 0.6]} />
      <ambientLight intensity={0.25} />
      {sun && (
        <directionalLight
          position={[sun.x * 40, sun.y * 40, sun.z * 40]}
          intensity={3 * sunFactor}
          color="#ffd66b"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
          shadow-camera-near={1}
          shadow-camera-far={120}
          shadow-normalBias={0.02}
        />
      )}

      {/* Ground floor and every slab above it. Stair shafts and the courtyard are left open. */}
      <Slab y={-0.05} S2={p.S2} holes={p.court} thickness={0.1} mat={mats.floor} />
      {Array.from({ length: p.F }, (_, i) => i + 1).map((f) => (
        <Slab
          key={`slab-${f}`}
          y={f * STOREY_H}
          S2={p.S2}
          holes={f < p.F ? [p.stair, ...p.court] : p.court}
          mat={f === p.F ? mats.roof : mats.ceiling}
        />
      ))}

      {Array.from({ length: p.F }, (_, f) => (
        <Storey key={`storey-${f}`} f={f} p={p} hasJali={hasJali} hasAangan={hasAangan} mats={mats} />
      ))}

      {Array.from({ length: p.F - 1 }, (_, f) => (
        <Stairs key={`stairs-${f}`} base={f * STOREY_H} stair={p.stair} tread={p.tread} riser={p.riser} mat={mats.stair} />
      ))}

      {hasAangan && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow material={mats.court}>
            <planeGeometry args={[p.CS, p.CS]} />
          </mesh>
          {/* Set to one side so the trunk does not hide the jali from the standing view. */}
          <group position={[0.9, 0, -0.9]}>
            <CourtTree mats={mats} />
          </group>
        </>
      )}

      <SunGlow p={p} strength={glowStrength} />
    </>
  );
}

/**
 * Walk-in view of the building from the inside. The camera stands off-centre at eye level.
 * With jali applied, the sun shines through the front wall. With an aangan, the courtyard and tree are visible.
 */
export default function InteriorView({ building, hasJali = false, hasAangan = false, sunHour = 12 }) {
  const p = useMemo(() => plan(building, hasAangan), [building.footprintM2, building.floors, hasAangan]);
  const mats = useMemo(
    () => ({
      plaster: new THREE.MeshStandardMaterial({ color: "#e7dccb", roughness: 0.95 }),
      ceiling: new THREE.MeshStandardMaterial({ color: "#f1ebe0", roughness: 0.95 }),
      roof: new THREE.MeshStandardMaterial({ color: "#d9d1c2", roughness: 0.95 }),
      floor: new THREE.MeshStandardMaterial({ color: "#b9a58a", roughness: 0.9 }),
      stair: new THREE.MeshStandardMaterial({ color: "#c9bfae", roughness: 0.9 }),
      court: new THREE.MeshStandardMaterial({ color: "#c9bfa9", roughness: 1 }),
      jali: new THREE.MeshStandardMaterial({ color: "#c58a55", roughness: 0.9 }),
      bark: new THREE.MeshStandardMaterial({ color: "#6b5844", roughness: 0.95 }),
      leaf: new THREE.MeshStandardMaterial({ color: "#6a8656", roughness: 0.95 }),
      leafDark: new THREE.MeshStandardMaterial({ color: "#5d7a47", roughness: 0.95 }),
      bed: new THREE.MeshStandardMaterial({ color: "#4d463f", roughness: 1 }),
    }),
    []
  );

  return (
    <div style={{ width: "100%", height: "100%", background: "#cfe0ea" }}>
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ position: p.eye, fov: 62, near: 0.05, far: 200 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <color attach="background" args={["#cfe0ea"]} />
        <LookControls eye={p.eye} target={p.target} />
        <Scene building={building} p={p} hasJali={hasJali} hasAangan={hasAangan} sunHour={sunHour} mats={mats} />
      </Canvas>
    </div>
  );
}
