import React, { useRef, useEffect, useState, memo } from 'react';
import { StyleSheet, Platform, View, Text, ActivityIndicator } from 'react-native';
import { GLView } from 'expo-gl';
import { useTheme } from '@/hooks/useTheme';

const ThreeScene = memo(function ThreeScene() {
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const animationRef = useRef<number>();
  const sceneRef = useRef<any>(null);
  const { colors } = useTheme();

  // تنظيف عند فك التركيب
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (sceneRef.current?.renderer) {
        try { sceneRef.current.renderer.dispose(); } catch {}
      }
    };
  }, []);

  // دالة تهيئة المشهد ثلاثي الأبعاد
  const onContextCreate = async (gl: any) => {
    try {
      // استيراد المكتبات ديناميكياً لتجنب الأخطاء عند عدم توفر GL
      const { Renderer } = await import('expo-three');
      const THREE = await import('three');

      const renderer = new Renderer({ gl });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a6e5c);

      const camera = new THREE.PerspectiveCamera(
        75,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.1,
        1000
      );
      camera.position.z = 3;

      // كرة ذهبية
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

      // إضاءة
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(1, 2, 3);
      scene.add(directionalLight);

      const backLight = new THREE.DirectionalLight(0x444466, 0.5);
      backLight.position.set(-1, -1, -2);
      scene.add(backLight);

      // حلقة التحديث
      const animate = () => {
        if (!gl) return;
        animationRef.current = requestAnimationFrame(animate);
        sphere.rotation.x += 0.01;
        sphere.rotation.y += 0.02;
        renderer.render(scene, camera);
        gl.endFrameEXP();
      };

      animate();
      sceneRef.current = { scene, camera, sphere, renderer };
      setIsReady(true);
    } catch (err: any) {
      console.warn('ThreeScene initialization error:', err?.message || err);
      setError(err?.message || 'Failed to initialize 3D scene');
      setIsReady(false);
    }
  };

  // إذا حدث خطأ، نعرض عنصراً بديلاً
  if (error) {
    return (
      <View style={[styles.fallback, { backgroundColor: colors?.background || '#fff' }]}>
        <Text style={[styles.fallbackText, { color: colors?.textMuted || '#999' }]}>
          ⚠️ 3D غير متاح حالياً
        </Text>
      </View>
    );
  }

  // أثناء التحميل، نعرض مؤشراً
  if (!isReady) {
    return (
      <View style={[styles.fallback, { backgroundColor: colors?.background || '#fff' }]}>
        <ActivityIndicator size="large" color={colors?.primary || '#0A6E5C'} />
      </View>
    );
  }

  // العرض الرئيسي
  return (
    <GLView
      style={StyleSheet.absoluteFillObject}
      onContextCreate={onContextCreate}
    />
  );
});

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  fallbackText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default ThreeScene;