import { useMemo } from "react";

const JALI_MATERIAL = "#b87952";
const FRAME_MATERIAL = "#5c4639";

export default function Jali({
  position = [0, 0, 0],
  width = 2.8,
  height = 2.6,
  depth = 0.12,
}) {
  const columns = 6;
  const rows = 5;

  const elements = useMemo(() => {
    const pieces = [];

    const spacingX = width / columns;
    const spacingY = height / rows;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const x = -width / 2 + spacingX / 2 + col * spacingX;
        const y = -height / 2 + spacingY / 2 + row * spacingY;

        pieces.push(
          <mesh
  key={`${row}-${col}`}
  position={[x, y, 0]}
  rotation={[0, 0, Math.PI / 4]}
  castShadow
>
  <boxGeometry
    args={[
      spacingX * 0.72,
      spacingY * 0.72,
      depth,
    ]}
  />
  <meshStandardMaterial color={JALI_MATERIAL} />
</mesh>
        );
      }
    }

    return pieces;
  }, [width, height, depth]);

  return (
    <group position={position}>
      {/* Outer frame */}
      <mesh position={[0, height / 2 + 0.06, 0]} castShadow>
        <boxGeometry args={[width + 0.16, 0.12, depth]} />
        <meshStandardMaterial color={FRAME_MATERIAL} />
      </mesh>

      <mesh position={[0, -height / 2 - 0.06, 0]} castShadow>
        <boxGeometry args={[width + 0.16, 0.12, depth]} />
        <meshStandardMaterial color={FRAME_MATERIAL} />
      </mesh>

      <mesh position={[-width / 2 - 0.06, 0, 0]} castShadow>
        <boxGeometry args={[0.12, height, depth]} />
        <meshStandardMaterial color={FRAME_MATERIAL} />
      </mesh>

      <mesh position={[width / 2 + 0.06, 0, 0]} castShadow>
        <boxGeometry args={[0.12, height, depth]} />
        <meshStandardMaterial color={FRAME_MATERIAL} />
      </mesh>

      {/* Jali pattern */}
      {elements}
    </group>
  );
}
