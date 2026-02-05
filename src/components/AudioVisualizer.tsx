"use client";

import { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sphere, MeshDistortMaterial, Torus } from "@react-three/drei";
import * as THREE from "three";

interface AudioVisualizerProps {
  speaking: boolean;
  compact?: boolean;
}

function OrbitRing({ radius, speed, axis, speaking }: { radius: number; speed: number; axis: [number, number, number]; speaking: boolean }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    // Rotate based on time and speed
    ref.current.rotation.x = t * speed * axis[0];
    ref.current.rotation.y = t * speed * axis[1];
    ref.current.rotation.z = t * speed * axis[2];
    
    // Pulse scale slightly when speaking
    const targetScale = speaking ? 1.05 : 1.0;
    ref.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
  });

  return (
    <Torus ref={ref} args={[radius, 0.045, 24, 120]} rotation={[Math.PI / 2, 0, 0]}>
      <meshStandardMaterial
        color={speaking ? "#ef4444" : "#444444"}
        emissive={speaking ? "#ef4444" : "#444444"}
        emissiveIntensity={speaking ? 0.8 : 0.25}
        transparent
        opacity={speaking ? 0.75 : 0.45}
        roughness={0.1}
        metalness={0.95}
      />
    </Torus>
  );
}

function AnimatedCore({ speaking, compact }: { speaking: boolean; compact?: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { pointer } = useThree();

  useFrame((state) => {
    if (!meshRef.current) return;

    const t = state.clock.getElapsedTime();

    // Pointer tilt (subtle, “product” feel)
    const targetRx = pointer.y * 0.25;
    const targetRy = pointer.x * 0.35;

    meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, targetRx + t * 0.15, 0.06);
    meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetRy + t * 0.18, 0.06);

    const targetScale = speaking ? 1.08 : 1.0;
    const newScale = THREE.MathUtils.lerp(meshRef.current.scale.x, targetScale, 0.05);
    meshRef.current.scale.set(newScale, newScale, newScale);
  });

  return (
    <group>
      <Sphere ref={meshRef} args={[compact ? 0.85 : 1.55, 96, 96]}>
        <MeshDistortMaterial
          color={speaking ? "#ef4444" : "#444444"}
          attach="material"
          distort={speaking ? 0.32 : 0.25}
          speed={speaking ? 2.4 : 1.2}
          roughness={0.2}
          metalness={0.86}
          emissive={speaking ? "#ef4444" : "#000000"}
          emissiveIntensity={speaking ? 0.55 : 0.12}
        />
      </Sphere>
    </group>
  );
}

export function AudioVisualizer({ speaking, compact }: AudioVisualizerProps & { compact?: boolean }) {
  return (
    <div className="w-full h-full absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, compact ? 6.0 : 4.2], fov: 55 }}
        dpr={[1, 1.8]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[10, 10, 5]} intensity={1.2} />
        <pointLight position={[-10, -10, -10]} intensity={0.55} color={speaking ? "#ef4444" : "#3b82f6"} />

        <AnimatedCore speaking={speaking} compact={compact} />

        {/* Single "planet" ring (same size as inner ring) */}
        <OrbitRing radius={compact ? 1.5 : 2.2} speed={speaking ? 0.6 : 0.3} axis={[1, 0.5, 0]} speaking={speaking} />
      </Canvas>
    </div>
  );
}
