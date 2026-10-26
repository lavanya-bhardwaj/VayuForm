import { useMemo, useRef } from "react";
import * as THREE from "three";

export default function GreenRoof({
  position = [0, 9.0, 0],
  size = 0.8,
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
    const originalZ = groupRef.current.position.z;

    const handlePointerMove = (moveEvent) => {
      if (!groupRef.current) return;

      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const scaleFactor = 0.01;

      const newX = originalX + deltaX * scaleFactor;
      const newZ = originalZ - deltaY * scaleFactor;

      groupRef.current.position.x = THREE.MathUtils.clamp(
        newX,
        -5 + size / 2,
        5 - size / 2
      );

      groupRef.current.position.z = THREE.MathUtils.clamp(
        newZ,
        -3.75 + size / 2,
        3.75 - size / 2
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
      {/* PLANTER POT (circular base) */}
      <mesh>
        <cylinderGeometry args={[size * 0.35, size * 0.4, size * 0.4, 16]} />
        <meshStandardMaterial color="#A0826D" roughness={0.9} />
      </mesh>

      {/* SOIL/EARTH (top of pot) */}
      <mesh position={[0, size * 0.2, 0]}>
        <cylinderGeometry args={[size * 0.33, size * 0.38, size * 0.08, 16]} />
        <meshStandardMaterial color="#8B7355" roughness={0.95} />
      </mesh>

      {/* VEGETATION FOLIAGE (leafy sphere) */}
      <mesh position={[0, size * 0.55, 0]}>
        <sphereGeometry args={[size * 0.45, 16, 12]} />
        <meshStandardMaterial
          color="#4A7C3C"
          roughness={0.75}
          emissive="#2d5c1f"
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* ACCENT FOLIAGE (second sphere for layered look) */}
      <mesh position={[size * 0.15, size * 0.7, size * 0.1]}>
        <sphereGeometry args={[size * 0.35, 12, 10]} />
        <meshStandardMaterial
          color="#5A8C4C"
          roughness={0.75}
        />
      </mesh>

      {/* SELECTION OUTLINE */}
      {selected && (
        <mesh>
          <cylinderGeometry
            args={[size * 0.5, size * 0.55, size * 1.2, 16]}
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
