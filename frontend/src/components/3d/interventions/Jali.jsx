import { useMemo } from "react";
import * as THREE from "three";

/**
 * Procedurally generates a perforated 3D screen geometry with repeated diamond openings.
 *
 * @param {object} params
 * @param {number} params.width - Width of the screen in meters
 * @param {number} params.height - Height of the screen in meters
 * @param {number} params.depth - Physical thickness (extrusion depth) in meters
 * @param {number} params.density - Porosity/opening ratio (0.25 to 0.85)
 * @param {number} params.border - Solid perimeter border margin in meters
 * @returns {THREE.ExtrudeGeometry} Centered extrude geometry
 */
function createJaliGeometry({
  width = 3.0,
  height = 4.7,
  depth = 0.18,
  density = 0.55,
  border = 0.08,
}) {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;

  // Outer rectangular perimeter
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();

  // Diamond unit cell dimensions (slightly taller than wide for classic architectural proportions)
  const baseW = 0.22;
  const baseH = 0.30;
  const pitchX = baseW * 1.35;
  const pitchY = baseH * 0.70;

  // Scale opening size according to density
  const scale = Math.max(0.25, Math.min(0.85, Number(density) || 0.55));
  const dw = baseW * scale;
  const dh = baseH * scale;

  const rows = Math.floor((height - border * 2) / pitchY);
  const cols = Math.floor((width - border * 2) / pitchX);

  // Staggered diamond lattice generation
  for (let r = 0; r <= rows; r++) {
    const isOdd = r % 2 === 1;
    const xOffset = isOdd ? pitchX / 2 : 0;
    const cy = -hh + border + r * pitchY;

    for (let c = -1; c <= cols + 1; c++) {
      const cx = -hw + border + c * pitchX + xOffset;

      // Ensure each diamond void stays cleanly inside the solid perimeter border
      if (
        cx - dw / 2 >= -hw + border &&
        cx + dw / 2 <= hw - border &&
        cy - dh / 2 >= -hh + border &&
        cy + dh / 2 <= hh - border
      ) {
        const hole = new THREE.Path();
        // Rhombus / diamond vertices (top -> right -> bottom -> left)
        hole.moveTo(cx, cy + dh / 2);
        hole.lineTo(cx + dw / 2, cy);
        hole.lineTo(cx, cy - dh / 2);
        hole.lineTo(cx - dw / 2, cy);
        hole.closePath();
        shape.holes.push(hole);
      }
    }
  }

  // Extrude to full 3D thickness with subtle beveling like molded terracotta tiles
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 1,
  });

  // Center geometry so origin sits at the 3D center of the screen
  geometry.center();
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Creates structural standoff brackets that bridge the air gap from the facade wall
 * to the back face of the jali screen.
 */
function createStandoffGeometry(gapLength) {
  const geom = new THREE.CylinderGeometry(0.022, 0.022, gapLength, 12);
  // Rotate cylinder along Z axis so it points from wall to jali
  geom.rotateX(Math.PI / 2);
  return geom;
}

/**
 * Reusable 3D Jali Intervention Component.
 *
 * Models a genuine terracotta architectural shading screen with physical diamond
 * perforations, true 3D thickness, and structural standoff mountings leaving
 * a visible air gap in front of the building envelope.
 */
export default function Jali({
  position = [-2.42, 5.25, 4.19],
  width = 3.0,
  height = 4.7,
  depth = 0.18,
  density = 0.55,
  color = "#be5b3c", // Warm fired terracotta clay
  frameColor = "#8f3f26", // Darker perimeter frame
  standoffColor = "#4a4542", // Architectural steel mounting tie-rods
  showStandoffs = true,
  wallZ = 3.75, // Z coordinate of the building facade wall
  visible = true,
}) {
  // 1. Procedural Perforated Diamond Screen Geometry
  const jaliGeometry = useMemo(() => {
    return createJaliGeometry({ width, height, depth, density });
  }, [width, height, depth, density]);

  // 2. Terracotta Material (matte, unglazed porous clay)
  const terracottaMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      metalness: 0.02,
    });
  }, [color]);

  // 3. Perimeter Frame Material
  const frameMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: 0.82,
      metalness: 0.05,
    });
  }, [frameColor]);

  // 4. Standoff Mountings Material (steel tie-rods)
  const standoffMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: standoffColor,
      roughness: 0.45,
      metalness: 0.8,
    });
  }, [standoffColor]);

  // 5. Standoff brackets bridging the air gap
  const [posX, posY, posZ] = position;
  const jaliBackZ = posZ - depth / 2;
  const gapLength = Math.max(0.05, jaliBackZ - wallZ);
  const localStandoffZ = -depth / 2 - gapLength / 2;

  const standoffGeom = useMemo(() => {
    return createStandoffGeometry(gapLength);
  }, [gapLength]);

  // Standoff anchor coordinates relative to jali center
  const standoffPoints = useMemo(() => {
    const marginX = width / 2 - 0.14;
    const marginY = height / 2 - 0.28;
    return [
      [-marginX, marginY],
      [marginX, marginY],
      [-marginX, 0],
      [marginX, 0],
      [-marginX, -marginY],
      [marginX, -marginY],
    ];
  }, [width, height]);

  if (!visible) return null;

  return (
    <group position={[posX, posY, posZ]}>
      {/* Primary Perforated Terracotta Screen */}
      <mesh
        geometry={jaliGeometry}
        material={terracottaMaterial}
        castShadow
        receiveShadow
      />

      {/* Structural Perimeter Frame Edges */}
      {/* Top Edge */}
      <mesh
        position={[0, height / 2 + 0.025, 0]}
        material={frameMaterial}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width + 0.08, 0.05, depth + 0.015]} />
      </mesh>
      {/* Bottom Edge */}
      <mesh
        position={[0, -height / 2 - 0.025, 0]}
        material={frameMaterial}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width + 0.08, 0.05, depth + 0.015]} />
      </mesh>
      {/* Left Edge */}
      <mesh
        position={[-width / 2 - 0.025, 0, 0]}
        material={frameMaterial}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.05, height + 0.1, depth + 0.015]} />
      </mesh>
      {/* Right Edge */}
      <mesh
        position={[width / 2 + 0.025, 0, 0]}
        material={frameMaterial}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.05, height + 0.1, depth + 0.015]} />
      </mesh>

      {/* Structural Standoff Brackets bridging the air gap to the facade */}
      {showStandoffs &&
        standoffPoints.map(([sx, sy], index) => (
          <group key={index} position={[sx, sy, localStandoffZ]}>
            {/* Cylindrical tie-rod */}
            <mesh
              geometry={standoffGeom}
              material={standoffMaterial}
              castShadow
            />
            {/* Wall mounting plate flat against facade */}
            <mesh
              position={[0, 0, -gapLength / 2 + 0.01]}
              material={standoffMaterial}
              castShadow
            >
              <boxGeometry args={[0.08, 0.08, 0.02]} />
            </mesh>
          </group>
        ))}
    </group>
  );
}
