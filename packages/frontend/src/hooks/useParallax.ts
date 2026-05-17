import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  basePosition: THREE.Vector3;
}

export function useParallax3D() {
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    containerRef.current.style.transform = `
      perspective(1000px)
      rotateY(${x * 5}deg)
      rotateX(${y * 5}deg)
      translateZ(10px)
    `;
  }, []);

  const onMouseLeave = useCallback(() => {
    if (!containerRef.current) return;
    containerRef.current.style.transform = `
      perspective(1000px)
      rotateY(0deg)
      rotateX(0deg)
      translateZ(0px)
    `;
  }, []);

  return { containerRef, onMouseMove, onMouseLeave };
}
