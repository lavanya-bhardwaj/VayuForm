import { useMemo, useRef } from "react";
import * as THREE from "three";

export default function KhusChik({
  position = [-2.42, 5.25, 4.19],
  width = 3,
  height = 4.7,
  depth = 0.12,
  selected = false,
  onSelect,
  wall = "front", // "front", "left", "right", "back"
}) {
  const groupRef = useRef(null);

  const [posX, posY, posZ] = position;

  const grassTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#C4A747";
    ctx.fillRect(0, 0, 128, 128);

    for (let i = 0; i < 200; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const len = 3 + Math.random() * 5;
      ctx.strokeStyle = `rgba(139, 108, 45, ${0.3 + Math.random() * 0.4})`;
      ctx.lineWidth = 0.5 + Math.random() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * len, y + len);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    return texture;
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

      if (wall === "left" || wall === "right") {
        // Side walls: constrain Z (front-back) and Y (up-down)
        const newZ = originalX + deltaX * scaleFactor; // Use Z for side walls
        const newY = originalY - deltaY * scaleFactor;

        groupRef.current.position.z = THREE.MathUtils.clamp(
          newZ,
          -3.75 + depth / 2,
          3.75 - depth / 2
        );

        groupRef.current.position.y = THREE.MathUtils.clamp(
          newY,
          height / 2 + 0.5,
          8.3 - height / 2
        );
      } else {
        // Front/back walls: constrain X (left-right) and Y (up-down)
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
      }
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
        <boxGeometry args={[width + 0.1, height + 0.1, 0.05]} />
        <meshStandardMaterial
          color="#505050"
          roughness={0.85}
        />
      </mesh>

      {/* KHUS-CHIK GRASS SCREEN (flat woven panel) */}
      <mesh geometry={new THREE.BoxGeometry(width, height, depth)}>
        <meshStandardMaterial
          map={grassTexture}
          color="#D4B896"
          roughness={0.8}
        />
      </mesh>

      {/* TOP FRAME */}
      <mesh position={[0, height / 2 + 0.08, 0]}>
        <boxGeometry
          args={[width + 0.25, 0.16, depth + 0.08]}
        />
        <meshStandardMaterial color="#8B6F47" />
      </mesh>

      {/* BOTTOM FRAME */}
      <mesh position={[0, -height / 2 - 0.08, 0]}>
        <boxGeometry
          args={[width + 0.25, 0.16, depth + 0.08]}
        />
        <meshStandardMaterial color="#8B6F47" />
      </mesh>

      {/* LEFT FRAME */}
      <mesh position={[-width / 2 - 0.08, 0, 0]}>
        <boxGeometry
          args={[0.16, height, depth + 0.08]}
        />
        <meshStandardMaterial color="#8B6F47" />
      </mesh>

      {/* RIGHT FRAME */}
      <mesh position={[width / 2 + 0.08, 0, 0]}>
        <boxGeometry
          args={[0.16, height, depth + 0.08]}
        />
        <meshStandardMaterial color="#8B6F47" />
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
