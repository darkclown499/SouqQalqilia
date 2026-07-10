// Shim for react-native-gesture-handler on web/SSR.
// The real package uses native modules that are unavailable in Node.js SSR
// (expo-router's static render step). This shim exports safe no-op stubs
// so that top-level `import 'react-native-gesture-handler'` and any
// component imports don't crash during web bundling / SSR.

'use strict';

const React = require('react');

// ── No-op gesture stubs ───────────────────────────────────────────────────────
function noop() {}
function noopAsync() { return Promise.resolve(); }

const GestureHandlerRootView = ({ children, style, ...rest }) =>
  React.createElement('div', { style: [{ display: 'flex', flex: 1 }, style], ...rest }, children);

const GestureDetector = ({ children }) => children ?? null;

// Gesture builder stubs — every method returns `this` for chaining
function makeGesture(name) {
  const obj = { _name: name };
  const chainable = [
    'onStart', 'onUpdate', 'onEnd', 'onFinalize', 'onFail', 'onCancel',
    'enabled', 'shouldCancelWhenOutside', 'hitSlop', 'simultaneousWithExternalGesture',
    'requireExternalGestureToFail', 'blocksExternalGesture', 'withRef',
    'onBegin', 'onChange', 'minDistance', 'maxDistance', 'minVelocity',
    'minPointers', 'maxPointers', 'numberOfTaps', 'minDurationMs',
    'maxDurationMs', 'minDeltaX', 'maxDeltaX', 'minDeltaY', 'maxDeltaY',
    'activeOffsetX', 'activeOffsetY', 'failOffsetX', 'failOffsetY',
    'averageTouches', 'enableTrackpadTwoFingerGesture', 'withTestId',
  ];
  chainable.forEach(method => { obj[method] = () => obj; });
  return obj;
}

const Gesture = {
  Pan: () => makeGesture('Pan'),
  Tap: () => makeGesture('Tap'),
  LongPress: () => makeGesture('LongPress'),
  Pinch: () => makeGesture('Pinch'),
  Rotation: () => makeGesture('Rotation'),
  Fling: () => makeGesture('Fling'),
  Native: () => makeGesture('Native'),
  Manual: () => makeGesture('Manual'),
  Race: (...g) => ({ gestures: g }),
  Simultaneous: (...g) => ({ gestures: g }),
  Exclusive: (...g) => ({ gestures: g }),
};

// ── Legacy API stubs (PanGestureHandler etc.) ─────────────────────────────────
const PanGestureHandler = ({ children }) => children ?? null;
const TapGestureHandler = ({ children }) => children ?? null;
const LongPressGestureHandler = ({ children }) => children ?? null;
const PinchGestureHandler = ({ children }) => children ?? null;
const RotationGestureHandler = ({ children }) => children ?? null;
const FlingGestureHandler = ({ children }) => children ?? null;
const NativeViewGestureHandler = ({ children }) => children ?? null;

// ── Hook stubs ────────────────────────────────────────────────────────────────
function useAnimatedGestureHandler() { return noop; }

// ── State constants ───────────────────────────────────────────────────────────
const State = {
  UNDETERMINED: 0, FAILED: 1, BEGAN: 2, CANCELLED: 3, ACTIVE: 4, END: 5,
};

const Directions = { RIGHT: 1, LEFT: 2, UP: 4, DOWN: 8 };

// ── Touchable stubs ───────────────────────────────────────────────────────────
const TouchableHighlight = require('react-native').TouchableHighlight;
const TouchableOpacity   = require('react-native').TouchableOpacity;
const TouchableNativeFeedback = require('react-native').View; // no-op for web
const TouchableWithoutFeedback = require('react-native').View;

module.exports = {
  // Root / Detector
  GestureHandlerRootView,
  GestureDetector,
  Gesture,

  // Legacy handlers
  PanGestureHandler,
  TapGestureHandler,
  LongPressGestureHandler,
  PinchGestureHandler,
  RotationGestureHandler,
  FlingGestureHandler,
  NativeViewGestureHandler,

  // Hooks
  useAnimatedGestureHandler,

  // Constants
  State,
  Directions,

  // Touchables
  TouchableHighlight,
  TouchableOpacity,
  TouchableNativeFeedback,
  TouchableWithoutFeedback,

  // enable/disable helpers
  enableExperimentalWebImplementation: noop,
  enableLegacyWebImplementation: noop,
};
