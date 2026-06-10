import React, { useState, useRef } from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, Dimensions,
  FlatList, StatusBar, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdImage } from '@/services/adsService';

const { width, height } = Dimensions.get('window');

interface ImageZoomGalleryProps {
  images: AdImage[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}

export function ImageZoomGallery({ images, initialIndex = 0, visible, onClose }: ImageZoomGalleryProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatRef = useRef<FlatList>(null);

  // Sync currentIndex whenever the gallery opens with a different initialIndex
  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      // Scroll to the correct image after the FlatList has rendered
      setTimeout(() => {
        if (flatRef.current && initialIndex > 0) {
          flatRef.current.scrollToIndex({ index: initialIndex, animated: false });
        }
      }, 50);
    }
  }, [visible, initialIndex]);

  const handleMomentumScrollEnd = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentIndex(idx);
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <StatusBar hidden={Platform.OS === 'ios'} backgroundColor="#000" barStyle="light-content" />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <MaterialIcons name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.counter}>{currentIndex + 1} / {images.length}</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Images */}
        <FlatList
          ref={flatRef}
          data={images}
          keyExtractor={item => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          renderItem={({ item }) => (
            <View style={styles.imageWrap}>
              <Image
                source={{ uri: item.url }}
                style={styles.fullImage}
                contentFit="contain"
                transition={200}
              />
            </View>
          )}
        />

        {/* Thumbnails */}
        {images.length > 1 ? (
          <View style={[styles.thumbStrip, { paddingBottom: insets.bottom + 12 }]}>
            {images.map((img, i) => (
              <Pressable
                key={img.id}
                onPress={() => {
                  setCurrentIndex(i);
                  flatRef.current?.scrollToIndex({ index: i, animated: true });
                }}
                style={[
                  styles.thumb,
                  { borderColor: i === currentIndex ? '#fff' : 'transparent' },
                ]}
              >
                <Image
                  source={{ uri: img.url }}
                  style={styles.thumbImg}
                  contentFit="cover"
                />
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Dot indicators */}
        {images.length > 1 ? (
          <View style={styles.dots}>
            {images.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === currentIndex ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  placeholder: { width: 44 },
  imageWrap: {
    width,
    height: height * 0.7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: {
    width,
    height: height * 0.7,
  },
  thumbStrip: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  thumb: {
    width: 54,
    height: 54,
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 8,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 20,
    backgroundColor: '#fff',
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});
