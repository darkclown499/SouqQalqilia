import React, { useRef, useEffect, memo } from 'react';
import { StyleSheet, Platform } from 'react-native';
import { GLView } from 'expo-gl';

const ThreeScene = memo(function ThreeScene() {
  const glViewRef = useRef<any>(null);
  const mountRef = useRef(true);
  const animationFrameRef = useRef<number>();
  const sceneRef = useRef<any>(null);

  useEffect(() => {
    mountRef.current = true;

    const setupScene = async () => {
      if (!glViewRef.current || !mountRef.current) return;

      const { Renderer } = await import('expo-three');
      const THREE = await import('three');

      const gl = glViewRef.current;
      const renderer = new Renderer({ gl });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a6e5c);

      const camera = new THREE.PerspectiveCamera(75, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 1000);
      camera.position.z = 3;

      const geometry = new THREE.SphereGeometry(1, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: 0xe8c060,
        roughness: 0.4,
        metalness: 0.6,
        emissive: new THREE.Color(0xe8c060),
        emissiveIntensity: 0.2,
      });
      const sphere = new THREE.Mesh(geometry, material);
      scene.add(sphere);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(1, 2, 3);
      scene.add(directionalLight);
      const backLight = new THREE.DirectionalLight(0x444466, 0.5);
      backLight.position.set(-1, -1, -2);
      scene.add(backLight);

      const animate = () => {
        if (!mountRef.current) return;
        animationFrameRef.current = requestAnimationFrame(animate);
        sphere.rotation.x += 0.01;
        sphere.rotation.y += 0.02;
        renderer.render(scene, camera);
        gl.endFrameEXP();
      };

      animate();
      sceneRef.current = { scene, camera, sphere, renderer };
    };

    setupScene().catch(console.warn);

    return () => {
      mountRef.current = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (sceneRef.current) {
        try { sceneRef.current.renderer.dispose(); } catch {}
      }
    };
  }, []);

  return (
    <GLView
      ref={glViewRef}
      style={StyleSheet.absoluteFillObject}
      onContextCreate={() => {}}
    />
  );
});

export default ThreeScene;
