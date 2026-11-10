/** A small tree that grows with focus progress (0 → 1), or a withered one. */
import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

const lerp = (a, b, t) => a + (b - a) * Math.min(Math.max(t, 0), 1);

export default function Tree({ progress = 1, dead = false, size = 64 }) {
  const p = Math.min(Math.max(progress, 0), 1);
  const leaf = dead ? '#b3a58a' : '#2f9e44';
  const leafLight = dead ? '#c9bea5' : '#51cf66';
  const trunk = dead ? '#8d7b68' : '#8a5a3b';

  // Stage 1 (0–25%): a seedling with two leaves. After that a trunk rises and the crown fills in.
  const seedling = p < 0.25;
  const trunkH = lerp(6, 22, (p - 0.15) / 0.5);
  const crown = lerp(0, 1, (p - 0.2) / 0.8); // 0 → 1 crown scale
  const groundY = 56;
  const top = groundY - trunkH;

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Ellipse cx="32" cy={groundY + 2} rx="20" ry="4" fill="#e3d9c6" />
      {seedling ? (
        <>
          <Rect x="31" y={groundY - 9} width="2" height="9" rx="1" fill="#5c940d" />
          <Ellipse cx="27" cy={groundY - 10} rx={lerp(2, 5, p / 0.25)} ry={lerp(1.2, 2.6, p / 0.25)} fill={leafLight} rotation="-25" origin={`27, ${groundY - 10}`} />
          <Ellipse cx="37" cy={groundY - 11} rx={lerp(2, 5, p / 0.25)} ry={lerp(1.2, 2.6, p / 0.25)} fill={leaf} rotation="25" origin={`37, ${groundY - 11}`} />
        </>
      ) : (
        <>
          <Rect x="29.5" y={top} width="5" height={trunkH + 1} rx="2" fill={trunk} />
          {dead ? (
            // Bare, drooping branches.
            <Path d={`M32 ${top + 4} L24 ${top - 2} M32 ${top + 7} L41 ${top + 1} M32 ${top} L33 ${top - 8}`}
              stroke={trunk} strokeWidth="2" strokeLinecap="round" fill="none" />
          ) : null}
          {crown > 0 && (
            <>
              <Circle cx="32" cy={top - 8 * crown} r={14 * crown} fill={leaf} opacity={dead ? 0.55 : 1} />
              <Circle cx={32 - 9 * crown} cy={top - 1 * crown} r={9 * crown} fill={leaf} opacity={dead ? 0.55 : 1} />
              <Circle cx={32 + 9 * crown} cy={top - 2 * crown} r={9.5 * crown} fill={leaf} opacity={dead ? 0.55 : 1} />
              {!dead && <Circle cx={32 - 4 * crown} cy={top - 12 * crown} r={5 * crown} fill={leafLight} />}
            </>
          )}
        </>
      )}
    </Svg>
  );
}
