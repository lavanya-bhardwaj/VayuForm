import { useRef } from "react";
import * as THREE from "three";

export default function Chhajja({
  position = [-2.42, 6.5, 4.19],
  width = 3,
  depth = 1.0,
  thickness = 0.25,
  selected = false,
  onSelect,
}) {
  const groupRef = useRef(null);

  const [posX, posY, posZ] = position;

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
        6 + thickness / 2,
        8.3
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
      {/* BACKGROUND (drop shadow / gray backing) */}
      <mesh position={[0, 0, -0.1]}>
        <boxGeometry args={[width + 0.15, thickness + 0.15, 0.05]} />
        <meshStandardMaterial
          color="#505050"
          roughness={0.85}
        />
      </mesh>

      {/* MAIN OVERHANG SLAB */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[width, thickness, depth]} />
        <meshStandardMaterial
          color="#8B7355"
          roughness={0.7}
        />
      </mesh>

      {/* LEFT SUPPORT */}
      <mesh position={[-width / 2 - 0.12, -thickness / 2, depth / 2]}>
        <boxGeometry args={[0.15, 0.5, depth * 0.8]} />
        <meshStandardMaterial color="#6B5344" />
      </mesh>

      {/* RIGHT SUPPORT */}
      <mesh position={[width / 2 + 0.12, -thickness / 2, depth / 2]}>
        <boxGeometry args={[0.15, 0.5, depth * 0.8]} />
        <meshStandardMaterial color="#6B5344" />
      </mesh>

      {/* SELECTION OUTLINE */}
      {selected && (
        <mesh>
          <boxGeometry
            args={[
              width + 0.3,
              thickness + 0.3,
              depth + 0.3,
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
