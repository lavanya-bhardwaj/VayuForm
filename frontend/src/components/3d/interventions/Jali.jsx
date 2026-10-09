import { useMemo, useRef } from "react";
import * as THREE from "three";

function createJaliGeometry({
  width,
  height,
  depth,
  density,
}) {
  const shape = new THREE.Shape();

  const halfW = width / 2;
  const halfH = height / 2;

  shape.moveTo(-halfW, -halfH);
  shape.lineTo(halfW, -halfH);
  shape.lineTo(halfW, halfH);
  shape.lineTo(-halfW, halfH);
  shape.closePath();

  const holeCountX = Math.max(2, Math.floor(width * 2.2));
  const holeCountY = Math.max(3, Math.floor(height * 2.2));

  const spacingX = width / holeCountX;
  const spacingY = height / holeCountY;

  const diamondSize =
    Math.min(spacingX, spacingY) * density * 0.75;

  for (let y = 0; y < holeCountY; y++) {
    for (let x = 0; x < holeCountX; x++) {
      const cx = -halfW + spacingX * (x + 0.5);
      const cy = -halfH + spacingY * (y + 0.5);

      const hole = new THREE.Path();

      hole.moveTo(cx, cy + diamondSize);
      hole.lineTo(cx + diamondSize, cy);
      hole.lineTo(cx, cy - diamondSize);
      hole.lineTo(cx - diamondSize, cy);
      hole.closePath();

      shape.holes.push(hole);
    }
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
  });

  geometry.center();

  return geometry;
}

function createStandoffGeometry(gapLength) {
  const geometry = new THREE.CylinderGeometry(
    0.035,
    0.035,
    gapLength,
    12
  );

  geometry.rotateX(Math.PI / 2);

  return geometry;
}

export default function Jali({
  position = [-2.42, 5.25, 4.19],
  width = 3,
  height = 4.7,
  depth = 0.18,
  density = 0.55,
  // wallZ = 3.75,
  selected = false,
  onSelect,
}) {
  const groupRef = useRef(null);

  const [posX, posY, posZ] = position;

  const jaliGeometry = useMemo(() => {
    return createJaliGeometry({
      width,
      height,
      depth,
      density,
    });
  }, [width, height, depth, density]);

  const standoffGeometry = useMemo(() => {
    return createStandoffGeometry(0.44);
  }, []);

  const handlePointerDown = (event) => {
    event.stopPropagation();

    onSelect?.();

    const startX = event.clientX;
    const startY = event.clientY;

    const originalX = groupRef.current.position.x;
    const originalY = groupRef.current.position.y;

    const handlePointerMove = (moveEvent) => {
      if (!groupRef.current) return;

      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const scaleFactor = 0.01;

      const newX = originalX + deltaX * scaleFactor;
      const newY = originalY - deltaY * scaleFactor;

      groupRef.current.position.x = THREE.MathUtils.clamp(
        newX,
        -5 + width / 2,
        5 - width / 2
      );

      groupRef.current.position.y = THREE.MathUtils.clamp(
        newY,
        height / 2 + 0.5,
        8.3 - height / 2
      );
    };

    const handlePointerUp = () => {
      window.removeEventListener(
        "pointermove",
        handlePointerMove
      );

      window.removeEventListener(
        "pointerup",
        handlePointerUp
      );
    };

    window.addEventListener(
      "pointermove",
      handlePointerMove
    );

    window.addEventListener(
      "pointerup",
      handlePointerUp
    );
  };

  return (
    <group
      ref={groupRef}
      position={[posX, posY, posZ]}
      onPointerDown={handlePointerDown}
    >
      {/* JALI */}
      <mesh geometry={jaliGeometry}>
        <meshStandardMaterial
          color="#be5b3c"
          roughness={0.8}
        />
      </mesh>

      {/* TOP FRAME */}
      <mesh position={[0, height / 2 + 0.08, 0]}>
        <boxGeometry
          args={[width + 0.25, 0.16, depth + 0.08]}
        />
        <meshStandardMaterial color="#8f3f26" />
      </mesh>

      {/* BOTTOM FRAME */}
      <mesh position={[0, -height / 2 - 0.08, 0]}>
        <boxGeometry
          args={[width + 0.25, 0.16, depth + 0.08]}
        />
        <meshStandardMaterial color="#8f3f26" />
      </mesh>

      {/* LEFT FRAME */}
      <mesh position={[-width / 2 - 0.08, 0, 0]}>
        <boxGeometry
          args={[0.16, height, depth + 0.08]}
        />
        <meshStandardMaterial color="#8f3f26" />
      </mesh>

      {/* RIGHT FRAME */}
      <mesh position={[width / 2 + 0.08, 0, 0]}>
        <boxGeometry
          args={[0.16, height, depth + 0.08]}
        />
        <meshStandardMaterial color="#8f3f26" />
      </mesh>

      {/* STANDOFF LEFT */}
      <mesh
        geometry={standoffGeometry}
        position={[-width / 2 - 0.02, 0, -0.22]}
      >
        <meshStandardMaterial color="#4a4542" />
      </mesh>

      {/* STANDOFF RIGHT */}
      <mesh
        geometry={standoffGeometry}
        position={[width / 2 + 0.02, 0, -0.22]}
      >
        <meshStandardMaterial color="#4a4542" />
      </mesh>

      {/* SELECTION OUTLINE */}
      {selected && (
        <mesh>
          <boxGeometry
            args={[
              width + 0.35,
              height + 0.35,
              depth + 0.35,
            ]}
          />

          <meshBasicMaterial
            color="#ffffff"
            wireframe
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
    </group>
  );
}