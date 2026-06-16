import React, { useRef } from 'react';
import { StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';

interface Props {
  onAnimationFinish?: () => void;
  size: number;
}

export default function LottiePlayer({ onAnimationFinish, size }: Props) {
  const ref = useRef<LottieView>(null);
  return (
    <LottieView
      ref={ref}
      source={require('@/assets/animations/marketplace.json')}
      autoPlay
      loop={false}
      speed={0.9}
      onAnimationFinish={onAnimationFinish}
      style={{ width: size, height: size }}
    />
  );
}
