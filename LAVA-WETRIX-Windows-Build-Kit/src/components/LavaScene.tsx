import { useMemo, useRef, useLayoutEffect, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { W, D, H, idx, PieceDef } from "../game/constants";

export interface FallingState {
  def: PieceDef;
  cells: [number, number][]; // rotated local
  ox: number;
  oz: number;
  yFloat: number;
  landingY: number;
  /** cells (x,y,z) that would collapse if this piece were committed here */
  unstable?: [number, number, number][];
}

/** A stone mid-collapse: animated from its old cell to where it lands */
export interface CollapseFx {
  id: number;
  x: number;
  z: number;
  fromY: number;
  toY: number;
  t0: number;
  dur: number;
}

interface SceneProps {
  terrain: Uint8Array;
  lava: Float32Array;
  falling: FallingState | null;
  collapseFx?: CollapseFx[];
  centroid: [number, number, number];
  volume: number;
  danger: number;
  overflowPulse: number;
  autoOrbit: boolean;
  onHoverCell?: (x: number, z: number) => void;
  hoverY?: number;
  azimuthRef?: { current: number };
  rotateDelta?: number;
  cinematicOrbit?: boolean;
}

const cellToWorld = (x: number, yFloat: number, z: number): [number, number, number] => [
  x - W / 2 + 0.5,
  yFloat + 0.5,
  z - D / 2 + 0.5,
];

/* ══════════════════════════════════════════════════════════════
   FLUID SURFACE SHADER
   Waves are computed from WORLD xz, so neighbouring cells share
   one continuous surface instead of bobbing independently. Only
   top-face vertices move; side-face top rings move identically,
   so the mesh never tears. Normals are rebuilt analytically, which
   is what makes the molten surface catch the light as it rolls.
   ══════════════════════════════════════════════════════════════ */
const WAVE_GLSL = /* glsl */ `
  uniform float uTime;
  attribute float aFlow;
  attribute float aSurface;
  attribute vec3 aTint;
  varying float vCrest;
  varying float vFlowV;
  varying vec3 vTint;

  // layered swell + turbulence; amplitude rises while the cell is moving
  float lavaWave(vec2 p, float t, float flow) {
    float h = 0.0;
    h += sin(p.x * 0.55 + t * 0.85) * 0.34;
    h += sin(p.y * 0.62 - t * 0.72) * 0.30;
    h += sin((p.x + p.y) * 0.42 + t * 1.15) * 0.22;
    h += sin((p.x - p.y) * 0.78 - t * 0.95) * 0.16;
    // fine chop, mostly visible on disturbed lava
    float chop = sin(p.x * 1.9 - t * 2.3) * sin(p.y * 1.7 + t * 1.9);
    h += chop * (0.18 + flow * 0.85);
    return h;
  }
`;

/** Shared setup: instance scale, world-space sample point, wave height. */
const WAVE_CORE = /* glsl */ `
  float lw_sx = length(instanceMatrix[0].xyz);
  float lw_sy = max(length(instanceMatrix[1].xyz), 0.0001);
  float lw_sz = length(instanceMatrix[2].xyz);
  float lw_isTop = step(0.001, position.y) * aSurface;
  vec2 lw_wp = instanceMatrix[3].xz + vec2(position.x * lw_sx, position.z * lw_sz);
  float lw_amp = 0.11 + aFlow * 0.26;
  float lw_hC = lavaWave(lw_wp, uTime, aFlow) * lw_amp;
  vCrest = clamp(lw_hC / max(lw_amp, 0.0001) * 0.5 + 0.5, 0.0, 1.0) * lw_isTop;
  vFlowV = aFlow;
`;

/** Rebuild the surface normal from the slope of the wave field. */
const WAVE_NORMAL = /* glsl */ `
  float lw_e = 0.35;
  float lw_dhdx = (lavaWave(lw_wp + vec2(lw_e, 0.0), uTime, aFlow) * lw_amp - lw_hC) / lw_e;
  float lw_dhdz = (lavaWave(lw_wp + vec2(0.0, lw_e), uTime, aFlow) * lw_amp - lw_hC) / lw_e;
  // compensate for the instance's non-uniform Y scale so shallow pools
  // ripple as convincingly as deep ones
  vec3 lw_n = normalize(vec3(-lw_dhdx / max(lw_sx, 0.0001), 1.0 / lw_sy, -lw_dhdz / max(lw_sz, 0.0001)));
  objectNormal = mix(objectNormal, lw_n, lw_isTop);
`;

const WAVE_DISPLACE = /* glsl */ `
  // displacement is authored in world units, so divide out the instance
  // scale before the instance matrix multiplies it back in
  transformed.y += (lw_hC / lw_sy) * lw_isTop;
`;

/**
 * @param needsNormal  lit materials rebuild normals (and so evaluate the
 *   wave field three times); unlit glow shells skip that entirely and
 *   evaluate it once.
 */
function applyWaveShader(
  mat: THREE.Material,
  uTime: { value: number },
  { needsNormal, emissiveCrest }: { needsNormal: boolean; emissiveCrest: boolean }
) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;

    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${WAVE_GLSL}`);

    if (needsNormal) {
      // three prepares normals before positions, so compute the field once
      // there and reuse it at displacement time (same function scope).
      shader.vertexShader = shader.vertexShader
        .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${WAVE_CORE}\n${WAVE_NORMAL}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\nvTint = aTint;\n${WAVE_DISPLACE}`);
    } else {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\nvTint = aTint;\n${WAVE_CORE}\n${WAVE_DISPLACE}`
      );
    }

    // We carry our own tint varying rather than three's `vColor`: in r186
    // that varying is a vec4 and is only *declared* in the fragment stage
    // for USE_COLOR, not for instance colours. Owning it keeps this stable.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         varying float vCrest;
         varying float vFlowV;
         varying vec3 vTint;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         diffuseColor.rgb *= vTint;`
      );

    if (emissiveCrest) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         // crests flare toward white-gold, troughs cool to ember red,
         // and churning lava burns hotter than lava that has settled
         vec3 crestTint = mix(vec3(1.0, 0.42, 0.10), vec3(1.0, 0.86, 0.52), vCrest);
         totalEmissiveRadiance *= vTint * crestTint * (0.78 + vCrest * 0.85 + vFlowV * 0.6);`
      );
    }
  };
  mat.needsUpdate = true;
}

/* Reports camera azimuth and applies smooth horizontal camera spin commands */
function CameraDriver({
  azimuthRef,
  rotateDelta = 0,
  controlsRef,
}: {
  azimuthRef?: { current: number };
  rotateDelta?: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  cinematicOrbit?: boolean;
}) {
  const targetAngleRef = useRef(0);
  const currentAngleRef = useRef(0);
  const lastDeltaRef = useRef(0);

  useEffect(() => {
    if (rotateDelta !== lastDeltaRef.current) {
      targetAngleRef.current += rotateDelta - lastDeltaRef.current;
      lastDeltaRef.current = rotateDelta;
    }
  }, [rotateDelta]);

  useFrame(({ camera }) => {
    if (azimuthRef) azimuthRef.current = Math.atan2(camera.position.x, camera.position.z);

    const controls = controlsRef.current;
    if (!controls) return;

    const angleDiff = targetAngleRef.current - currentAngleRef.current;
    if (Math.abs(angleDiff) > 0.001) {
      const step = angleDiff * 0.16;
      currentAngleRef.current += step;
      const target = controls.target;
      const x = camera.position.x - target.x;
      const z = camera.position.z - target.z;
      const cos = Math.cos(step);
      const sin = Math.sin(step);
      camera.position.x = target.x + (x * cos - z * sin);
      camera.position.z = target.z + (x * sin + z * cos);
      camera.lookAt(target);
      controls.update();
    }
  });

  return null;
}

/* Invisible raycast plane — converts cursor position to a grid cell. */
function HoverPlane({
  terrain,
  yHint,
  onHover,
}: {
  terrain: Uint8Array;
  yHint: number;
  onHover: (x: number, z: number) => void;
}) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, yHint, 0]}
      onPointerMove={(e: any) => {
        try {
          const native = e.nativeEvent as PointerEvent | undefined;
          if (native && native.buttons !== 0) return;
          const ray = e.ray as THREE.Ray | undefined;
          if (!ray || Math.abs(ray.direction.y) < 1e-5) return;
          let planeY = yHint;
          let gx = -1;
          let gz = -1;
          for (let iter = 0; iter < 3; iter++) {
            const t = (planeY - ray.origin.y) / ray.direction.y;
            if (!isFinite(t) || t < 0) return;
            const px = ray.origin.x + ray.direction.x * t;
            const pz = ray.origin.z + ray.direction.z * t;
            gx = Math.floor(px + W / 2);
            gz = Math.floor(pz + D / 2);
            if (gx < 0 || gx >= W || gz < 0 || gz >= D) return;
            let top = -1;
            for (let y = H - 1; y >= 0; y--) {
              if (terrain[idx(gx, y, gz)]) {
                top = y;
                break;
              }
            }
            const newY = top + 1.5;
            if (Math.abs(newY - planeY) < 0.05) {
              planeY = newY;
              break;
            }
            planeY = newY;
          }
          if (gx >= 0 && gx < W && gz >= 0 && gz < D) onHover(gx, gz);
        } catch {
          /* ignore raycast edge cases */
        }
      }}
    >
      <planeGeometry args={[W, D]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ---------------- Terrain instanced layer ---------------- */
function TerrainLayer({ terrain }: { terrain: Uint8Array }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  const occupied = useMemo(() => {
    const list: [number, number, number][] = [];
    for (let y = 0; y < H; y++)
      for (let z = 0; z < D; z++)
        for (let x = 0; x < W; x++) if (terrain[idx(x, y, z)]) list.push([x, y, z]);
    return list;
  }, [terrain]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < occupied.length; i++) {
      const [x, y, z] = occupied[i];
      const [wx, wy, wz] = cellToWorld(x, y, z);
      dummy.position.set(wx, wy, wz);
      dummy.scale.setScalar(1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const v = 0.44 + (y / H) * 0.28 + ((x * 7 + z * 13 + y * 5) % 7) * 0.014;
      color.setRGB(v * 0.92, v * 0.98, v * 1.12);
      mesh.setColorAt(i, color);
    }
    mesh.count = occupied.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [occupied, dummy, color]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, W * D * H]} castShadow receiveShadow frustumCulled={false}>
      <boxGeometry args={[0.98, 0.98, 0.98]} />
      <meshStandardMaterial roughness={0.75} metalness={0.2} />
    </instancedMesh>
  );
}

/* ---------------- Lava: live fluid surface ---------------- */
function LavaLayer({ lava }: { lava: Float32Array }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const glowRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const uTime = useMemo(() => ({ value: 0 }), []);
  const prevLava = useRef<Float32Array | null>(null);
  const flowDecay = useRef<Float32Array>(new Float32Array(W * D * H));

  const MAX = W * D * H;

  // subdivided box: 5×5 verts across the top face is enough for visible swell
  const geom = useMemo(() => new THREE.BoxGeometry(1, 1, 1, 4, 1, 4), []);
  const glowGeom = useMemo(() => new THREE.BoxGeometry(1, 1, 1, 4, 1, 4), []);
  useEffect(
    () => () => {
      geom.dispose();
      glowGeom.dispose();
    },
    [geom, glowGeom]
  );

  const aFlow = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1), [MAX]);
  const aSurface = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1), [MAX]);
  const aTint = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3), [MAX]);

  useLayoutEffect(() => {
    for (const g of [geom, glowGeom]) {
      g.setAttribute("aFlow", aFlow);
      g.setAttribute("aSurface", aSurface);
      g.setAttribute("aTint", aTint);
    }
  }, [geom, glowGeom, aFlow, aSurface, aTint]);

  // Colour travels through our own `aTint` attribute rather than three's
  // instance-colour path: in r186 `vColor` is a vec4 that the fragment
  // stage only declares for USE_COLOR, so relying on it would not compile.
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.22,
        metalness: 0.0,
        emissive: new THREE.Color("#ff4400"),
        emissiveIntensity: 2.7,
        toneMapped: false,
      }),
    []
  );

  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    []
  );

  useLayoutEffect(() => {
    // the lit surface rebuilds normals; the additive glow shell does not
    applyWaveShader(mat, uTime, { needsNormal: true, emissiveCrest: true });
    applyWaveShader(glowMat, uTime, { needsNormal: false, emissiveCrest: false });
  }, [mat, glowMat, uTime]);

  useEffect(
    () => () => {
      mat.dispose();
      glowMat.dispose();
    },
    [mat, glowMat]
  );

  // rebuild instances only when the simulation changes, not every frame
  useLayoutEffect(() => {
    const mesh = ref.current;
    const glow = glowRef.current;
    if (!mesh || !glow) return;

    const prev = prevLava.current;
    const decay = flowDecay.current;
    let n = 0;

    for (let y = 0; y < H; y++) {
      for (let z = 0; z < D; z++) {
        for (let x = 0; x < W; x++) {
          const i = idx(x, y, z);
          const a = lava[i];
          if (a <= 0.03) {
            decay[i] = 0;
            continue;
          }

          // disturbance: how much this cell changed since the last tick.
          // decays smoothly so a pour churns, then glasses over.
          const delta = prev ? Math.abs(a - prev[i]) : 0.35;
          decay[i] = Math.max(decay[i] * 0.82, Math.min(1, delta * 7));
          const flow = decay[i];

          const amt = Math.min(1.2, a);
          const h = 0.28 + Math.min(1, amt) * 0.64;
          const [wx, , wz] = cellToWorld(x, y, z);
          const wy = y + h / 2 + 0.03;

          // a cell is "surface" only if nothing floats directly above it
          const above = y + 1 < H ? lava[idx(x, y + 1, z)] : 0;
          const isSurface = above <= 0.12 ? 1 : 0;

          dummy.position.set(wx, wy, wz);
          dummy.scale.set(0.98, h, 0.98);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(n, dummy.matrix);

          const heat = Math.min(1, amt * 0.75 + flow * 0.35);
          if (heat < 0.45) color.setRGB(0.78 + heat * 0.3, 0.16 + heat * 0.5, 0.04);
          else if (heat < 0.8) color.setRGB(1.0, 0.36 + heat * 0.36, 0.05);
          else color.setRGB(1.0, 0.64 + heat * 0.26, 0.26 + heat * 0.3);

          dummy.scale.set(1.06, Math.max(0.08, h * 0.62), 1.06);
          dummy.updateMatrix();
          glow.setMatrixAt(n, dummy.matrix);

          aTint.setXYZ(n, color.r, color.g, color.b);
          aFlow.setX(n, flow);
          aSurface.setX(n, isSurface);
          n++;
        }
      }
    }

    mesh.count = n;
    glow.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
    aFlow.needsUpdate = true;
    aSurface.needsUpdate = true;
    aTint.needsUpdate = true;

    if (!prevLava.current || prevLava.current.length !== lava.length) {
      prevLava.current = new Float32Array(lava);
    } else {
      prevLava.current.set(lava);
    }
  }, [lava, dummy, color, aFlow, aSurface, aTint]);

  // waves animate on the GPU — no React re-render, no matrix rebuild
  useFrame((_, delta) => {
    uTime.value += delta;
  });

  return (
    <group>
      <instancedMesh ref={ref} args={[geom, mat, MAX]} frustumCulled={false} />
      <instancedMesh ref={glowRef} args={[glowGeom, glowMat, MAX]} frustumCulled={false} />
    </group>
  );
}

/* ---------------- Falling piece + ghost ---------------- */
function FallingPiece({ falling }: { falling: FallingState | null }) {
  const group = useRef<THREE.Group>(null!);
  const unitEdges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)), []);
  useEffect(() => () => unitEdges.dispose(), [unitEdges]);
  useFrame(({ clock }) => {
    if (group.current) group.current.position.y = Math.sin(clock.elapsedTime * 6) * 0.025;
  });
  if (!falling) return null;
  const { def, cells, ox, oz, yFloat, landingY } = falling;
  const unstable = falling.unstable ?? [];
  const unstableKeys = new Set(unstable.map(([x, y, z]) => `${x},${y},${z}`));
  const abs = cells.map(([dx, dz]) => [ox + dx, oz + dz] as [number, number]);

  const isLava = def.kind === "lava";
  const isArrow = def.kind === "arrow";

  return (
    <group>
      {abs.map(([x, z], i) => {
        const [wx, , wz] = cellToWorld(x, 0, z);
        const top = yFloat + 0.5;
        const bottom = Math.max(0, landingY);
        const midY = (top + bottom) / 2;
        const hgt = Math.max(0.1, top - bottom);
        return (
          <mesh key={`beam-${i}`} position={[wx, midY, wz]}>
            <boxGeometry args={[0.14, hgt, 0.14]} />
            <meshBasicMaterial
              color={isLava ? "#ff7a1a" : isArrow ? "#38e1ff" : "#ffffff"}
              transparent
              opacity={0.32}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        );
      })}
      {abs.map(([x, z], i) => {
        const [wx, wy, wz] = cellToWorld(x, landingY, z);
        const doomed = unstableKeys.has(`${x},${landingY},${z}`);
        return (
          <group key={`ghost-${i}`} position={[wx, wy, wz]}>
            <mesh>
              <boxGeometry args={[0.98, 0.14, 0.98]} />
              <meshBasicMaterial
                color={doomed ? "#ff4040" : isLava ? "#ff8c2e" : isArrow ? "#38e1ff" : "#cdd6ea"}
                transparent
                opacity={doomed ? 0.6 : isArrow ? 0.55 : 0.42}
                depthWrite={false}
              />
            </mesh>
            <mesh>
              <boxGeometry args={[1.04, 0.02, 1.04]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.18} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
      {isArrow &&
        (() => {
          const [x, z] = abs[0];
          const [wx, , wz] = cellToWorld(x, 0, z);
          return (
            <mesh position={[wx, H / 2, wz]}>
              <boxGeometry args={[0.9, H, 0.9]} />
              <meshBasicMaterial color="#38e1ff" transparent opacity={0.1} depthWrite={false} />
            </mesh>
          );
        })()}
      {unstable.map(([x, y, z], i) => {
        const [wx, wy, wz] = cellToWorld(x, y, z);
        return (
          <group key={`u-${i}`} position={[wx, wy, wz]}>
            <mesh>
              <boxGeometry args={[1.0, 1.0, 1.0]} />
              <meshBasicMaterial color="#ff3b3b" transparent opacity={0.2} depthWrite={false} />
            </mesh>
            {/* @ts-ignore */}
            <lineSegments geometry={unitEdges}>
              <lineBasicMaterial color="#ff6b6b" transparent opacity={0.95} />
            </lineSegments>
          </group>
        );
      })}
      <group ref={group}>
        {abs.map(([x, z], i) => {
          const [wx, , wz] = cellToWorld(x, 0, z);
          const wy = yFloat + 0.5;
          if (isLava) {
            return (
              <group key={`p-${i}`} position={[wx, wy, wz]}>
                <mesh>
                  <sphereGeometry args={[0.48, 20, 16]} />
                  <meshStandardMaterial
                    color="#3a0d00"
                    emissive="#ff5a00"
                    emissiveIntensity={3.2}
                    roughness={0.25}
                    toneMapped={false}
                  />
                </mesh>
                <mesh>
                  <sphereGeometry args={[0.58, 12, 10]} />
                  <meshBasicMaterial color="#ff7a1a" transparent opacity={0.28} blending={THREE.AdditiveBlending} depthWrite={false} />
                </mesh>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <torusGeometry args={[0.48, 0.055, 8, 24]} />
                  <meshStandardMaterial color="#ffd9a0" emissive="#ffb03a" emissiveIntensity={1.3} roughness={0.3} />
                </mesh>
              </group>
            );
          }
          if (isArrow) {
            return (
              <group key={`p-${i}`} position={[wx, wy, wz]}>
                <mesh position={[0, 0.35, 0]}>
                  <coneGeometry args={[0.38, 0.78, 4]} />
                  <meshStandardMaterial color="#bffbff" emissive="#38e1ff" emissiveIntensity={2.6} roughness={0.2} toneMapped={false} />
                </mesh>
                <mesh position={[0, -0.25, 0]}>
                  <boxGeometry args={[0.32, 0.68, 0.32]} />
                  <meshStandardMaterial color="#0e3a44" emissive="#1899b3" emissiveIntensity={1.4} roughness={0.3} />
                </mesh>
                <mesh rotation={[Math.PI / 4, 0, 0]}>
                  <boxGeometry args={[1.0, 0.07, 1.0]} />
                  <meshBasicMaterial color="#38e1ff" transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} />
                </mesh>
              </group>
            );
          }
          return (
            <group key={`p-${i}`} position={[wx, wy, wz]}>
              <mesh castShadow>
                <boxGeometry args={[0.98, 0.98, 0.98]} />
                <meshStandardMaterial color="#cbd8ec" roughness={0.55} metalness={0.28} />
              </mesh>
              <mesh>
                <boxGeometry args={[1.02, 1.02, 1.02]} />
                <meshBasicMaterial color="#e8eefc" transparent opacity={0.16} depthWrite={false} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

/* ══════════════════════════════════════════════════════════════
   FLOOR — no walls, no ceiling. Just the grid and the dark.
   The danger signal that used to live on the top rim now breathes
   through the floor's perimeter so nothing floats in mid-air.
   ══════════════════════════════════════════════════════════════ */
function Floor({ danger, pulse }: { danger: number; pulse: number }) {
  const rimColor = danger > 0.5 ? "#ff2200" : danger > 0.25 ? "#ff7a1a" : "#ff9a3c";
  const rimIntensity = 0.5 + danger * 2.4 + pulse * 0.8;
  const halo = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (halo.current) {
      const breathe = 0.5 + Math.sin(clock.elapsedTime * 2.2) * 0.5;
      (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.05 + danger * 0.22 * (0.6 + breathe * 0.4);
    }
  });
  return (
    <group>
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[W + 1.4, 0.5, D + 1.4]} />
        <meshStandardMaterial color="#14121c" roughness={0.9} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[W, 0.02, D]} />
        <meshStandardMaterial color="#1e1b2a" roughness={0.7} metalness={0.4} emissive="#120a08" emissiveIntensity={0.6} />
      </mesh>

      {/* the grid stays — it is the map */}
      <gridHelper args={[W, W, "#ff7a1a", "#2c2538"]} position={[0, 0.03, 0]} />

      {/* perimeter rails at floor level carry the overflow warning */}
      {[
        { p: [0, 0.06, D / 2] as const, a: [W + 0.2, 0.1, 0.12] as const },
        { p: [0, 0.06, -D / 2] as const, a: [W + 0.2, 0.1, 0.12] as const },
        { p: [W / 2, 0.06, 0] as const, a: [0.12, 0.1, D + 0.2] as const },
        { p: [-W / 2, 0.06, 0] as const, a: [0.12, 0.1, D + 0.2] as const },
      ].map((r, i) => (
        <mesh key={i} position={r.p as unknown as [number, number, number]}>
          <boxGeometry args={r.a as unknown as [number, number, number]} />
          <meshStandardMaterial color="#1a0d05" emissive={rimColor} emissiveIntensity={rimIntensity} roughness={0.4} toneMapped={false} />
        </mesh>
      ))}

      {/* soft danger wash across the floor */}
      <mesh ref={halo} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W + 1.2, D + 1.2]} />
        <meshBasicMaterial color={rimColor} transparent opacity={0.05} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[W + 1.8, 0.12, D + 1.8]} />
        <meshStandardMaterial color="#000" emissive="#ff5a00" emissiveIntensity={0.6} roughness={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.65, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[42, 56]} />
        <meshStandardMaterial color="#07050c" roughness={1} />
      </mesh>
    </group>
  );
}

function Embers({ volume }: { volume: number }) {
  const ref = useRef<THREE.Points>(null!);
  const N = 220;
  const seeds = useMemo(
    () =>
      Array.from({ length: N }).map(() => ({
        x: (Math.random() - 0.5) * W * 0.92,
        z: (Math.random() - 0.5) * D * 0.92,
        speed: 0.6 + Math.random() * 1.6,
        offset: Math.random() * 20,
      })),
    []
  );
  const positions = useMemo(() => new Float32Array(N * 3), []);
  const attr = useMemo(() => new THREE.BufferAttribute(positions, 3), [positions]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const strength = Math.min(1, 0.25 + volume / 60);
    for (let i = 0; i < N; i++) {
      const s = seeds[i];
      const rise = ((t * s.speed + s.offset) % (H + 6)) - 1;
      positions[i * 3] = s.x + Math.sin(t * 0.8 + s.offset) * 0.6;
      positions[i * 3 + 1] = rise;
      positions[i * 3 + 2] = s.z + Math.cos(t * 0.6 + s.offset) * 0.6;
    }
    attr.needsUpdate = true;
    if (ref.current) (ref.current.material as THREE.PointsMaterial).opacity = 0.35 * strength + 0.25;
  });
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.16} color="#ffab4a" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
    </points>
  );
}

function LavaLights({ centroid, volume }: { centroid: [number, number, number]; volume: number }) {
  const light = useRef<THREE.PointLight>(null!);
  const [wx, wy, wz] = cellToWorld(centroid[0], centroid[1], centroid[2]);
  useFrame(({ clock }) => {
    if (light.current) {
      const flick = Math.sin(clock.elapsedTime * 9) * 0.25 + Math.sin(clock.elapsedTime * 23) * 0.12;
      light.current.intensity = Math.min(90, 8 + volume * 0.9 + flick * (2 + volume * 0.15));
    }
  });
  return (
    <>
      <pointLight ref={light} position={[wx, Math.max(1.5, wy), wz]} color="#ff6a1a" distance={48} decay={1.8} />
      <pointLight position={[0, H + 4, 0]} color="#7a5cff" intensity={6} distance={52} decay={2} />
    </>
  );
}

/* ---------------- Collapse debris ---------------- */
function DebrisCube({ fx }: { fx: CollapseFx }) {
  const ref = useRef<THREE.Mesh>(null!);
  const dust = useRef<THREE.Mesh>(null!);
  const [wx0, , wz0] = cellToWorld(fx.x, 0, fx.z);
  useFrame(() => {
    const p = Math.min(1, Math.max(0, (performance.now() - fx.t0) / fx.dur));
    const e = p * p;
    const y = fx.fromY - (fx.fromY - fx.toY) * e;
    if (ref.current) {
      ref.current.position.set(wx0, y + 0.5, wz0);
      const wob = Math.sin(p * Math.PI) * 0.16;
      ref.current.rotation.set(wob * 0.6, 0, fx.x % 2 === 0 ? wob : -wob);
    }
    if (dust.current) {
      const dp = Math.max(0, (p - 0.7) / 0.3);
      dust.current.scale.setScalar(0.4 + dp * 1.6);
      (dust.current.material as THREE.MeshBasicMaterial).opacity = p > 0.7 ? (1 - dp) * 0.4 : 0;
    }
  });
  return (
    <group>
      <mesh ref={ref} castShadow>
        <boxGeometry args={[0.98, 0.98, 0.98]} />
        <meshStandardMaterial color="#b9c3d8" roughness={0.7} metalness={0.2} emissive="#ff6a1a" emissiveIntensity={0.4} />
      </mesh>
      <mesh ref={dust} position={[wx0, fx.toY + 0.04, wz0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 20]} />
        <meshBasicMaterial color="#d8c7b0" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function CollapseDebris({ fx }: { fx: CollapseFx[] }) {
  if (!fx.length) return null;
  return (
    <group>
      {fx.map((f) => (
        <DebrisCube key={f.id} fx={f} />
      ))}
    </group>
  );
}

export default function LavaScene(props: SceneProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 26, 27], fov: 42 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      style={{ background: "radial-gradient(1200px 700px at 50% 20%, #1b0f1e 0%, #0a0612 55%, #040308 100%)" }}
    >
      <color attach="background" args={["#050309"]} />
      <fog attach="fog" args={["#050309", 42, 90]} />
      <ambientLight intensity={0.5} color="#8d86b8" />
      <directionalLight position={[12, 20, 10]} intensity={1.35} color="#fff2df" castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-10, 9, -8]} intensity={0.35} color="#6a7cff" />
      <LavaLights centroid={props.centroid} volume={props.volume} />
      <CameraDriver azimuthRef={props.azimuthRef} rotateDelta={props.rotateDelta} controlsRef={controlsRef} />

      <Floor danger={props.danger} pulse={props.overflowPulse} />
      <TerrainLayer terrain={props.terrain} />
      <LavaLayer lava={props.lava} />
      <FallingPiece falling={props.falling} />
      <CollapseDebris fx={props.collapseFx ?? []} />
      <Embers volume={props.volume} />
      {props.onHoverCell && <HoverPlane terrain={props.terrain} yHint={props.hoverY ?? 0.5} onHover={props.onHoverCell} />}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, 3.5, 0]}
        minDistance={12}
        maxDistance={60}
        maxPolarAngle={1.45}
        minPolarAngle={0.2}
        enablePan={false}
        autoRotate={props.autoOrbit || !!props.cinematicOrbit}
        autoRotateSpeed={props.cinematicOrbit ? 1.0 : 0.6}
      />
    </Canvas>
  );
}
