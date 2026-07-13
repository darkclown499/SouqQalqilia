// shims/react-native.js
// Safe web/SSR stub for react-native.
// Provides just enough surface area so expo-router/ExpoRoot.js
// can evaluate without the Babel platform-guard transform producing
// the malformed `react_native_1.(typeof Platform …)` syntax error.

const noop = () => {};
const noopObj = {};

const Platform = {
  OS: 'web',
  Version: 0,
  isPad: false,
  isTVOS: false,
  isTV: false,
  constants: { reactNativeVersion: { major: 0, minor: 0, patch: 0 } },
  select: (obj) => {
    if (obj && 'web' in obj) return obj.web;
    if (obj && 'default' in obj) return obj.default;
    return undefined;
  },
};

const StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => style || {},
  hairlineWidth: 1,
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
};

const Dimensions = {
  get: (dim) => dim === 'screen' ? { width: 375, height: 812, scale: 1, fontScale: 1 } : { width: 375, height: 812, scale: 1, fontScale: 1 },
  addEventListener: () => ({ remove: noop }),
  removeEventListener: noop,
};

const Animated = {
  Value: class { constructor(v) { this._v = v; } },
  ValueXY: class { constructor(v) { this._v = v; } },
  createAnimatedComponent: (C) => C,
  timing: () => ({ start: noop, stop: noop, reset: noop }),
  spring: () => ({ start: noop, stop: noop, reset: noop }),
  decay: () => ({ start: noop, stop: noop, reset: noop }),
  sequence: () => ({ start: noop, stop: noop, reset: noop }),
  parallel: () => ({ start: noop, stop: noop, reset: noop }),
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  ScrollView: 'ScrollView',
  FlatList: 'FlatList',
};

const I18nManager = { isRTL: false, forceRTL: noop, allowRTL: noop, swapLeftAndRightInRTL: noop };
const AccessibilityInfo = { fetch: () => Promise.resolve(false), addEventListener: () => ({ remove: noop }), removeEventListener: noop };
const Alert = { alert: noop, prompt: noop };
const AppState = { currentState: 'active', addEventListener: () => ({ remove: noop }), removeEventListener: noop };
const BackHandler = { addEventListener: () => ({ remove: noop }), removeEventListener: noop, exitApp: noop };
const DeviceInfo = {};
const Easing = { linear: (t) => t, ease: (t) => t, quad: (t) => t, cubic: (t) => t, in: (e) => e, out: (e) => e, inOut: (e) => e, bounce: (t) => t, back: () => (t) => t, elastic: () => (t) => t, bezier: () => (t) => t };
const Keyboard = { addListener: () => ({ remove: noop }), removeListener: noop, dismiss: noop, scheduleLayoutAnimation: noop };
const Linking = { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(false), getInitialURL: () => Promise.resolve(null), addEventListener: () => ({ remove: noop }), removeEventListener: noop };
const NativeModules = {};
const PixelRatio = { get: () => 1, getFontScale: () => 1, getPixelSizeForLayoutSize: (s) => s, roundToNearestPixel: (s) => s };
const Share = { share: () => Promise.resolve({ action: 'dismissedAction' }) };
const Vibration = { vibrate: noop, cancel: noop };
const InteractionManager = { runAfterInteractions: (cb) => { if (cb) cb(); return { cancel: noop }; }, createInteractionHandle: () => 0, clearInteractionHandle: noop };
const LayoutAnimation = { configureNext: noop, create: () => noopObj, Types: {}, Properties: {}, Presets: { easeInEaseOut: noopObj, linear: noopObj, spring: noopObj } };
const NativeEventEmitter = class { constructor() {} addListener() { return { remove: noop }; } removeAllListeners() {} emit() {} };
const PanResponder = { create: () => ({ panHandlers: {} }) };
const PermissionsAndroid = { request: () => Promise.resolve('granted'), check: () => Promise.resolve(true), PERMISSIONS: {}, RESULTS: {} };
const Settings = { get: () => null, set: noop, watchKeys: () => 0, clearWatch: noop };
const StatusBar = { setBarStyle: noop, setBackgroundColor: noop, setHidden: noop, setTranslucent: noop, currentHeight: 0 };
const ToastAndroid = { show: noop, showWithGravity: noop, SHORT: 0, LONG: 1, TOP: 0, BOTTOM: 1, CENTER: 2 };
const TurboModuleRegistry = { get: () => null, getEnforcing: () => ({}) };

// View-like component stubs
const viewStub = 'div';
const textStub = 'span';

module.exports = {
  Platform,
  StyleSheet,
  Dimensions,
  Animated,
  I18nManager,
  AccessibilityInfo,
  Alert,
  AppState,
  BackHandler,
  DeviceInfo,
  Easing,
  Keyboard,
  Linking,
  NativeModules,
  NativeEventEmitter,
  PanResponder,
  PermissionsAndroid,
  PixelRatio,
  Settings,
  Share,
  StatusBar,
  ToastAndroid,
  TurboModuleRegistry,
  Vibration,
  InteractionManager,
  LayoutAnimation,
  // Component stubs (strings so React doesn't crash on render)
  View: viewStub,
  Text: textStub,
  Image: 'img',
  TextInput: 'input',
  ScrollView: viewStub,
  FlatList: viewStub,
  SectionList: viewStub,
  VirtualizedList: viewStub,
  TouchableOpacity: viewStub,
  TouchableHighlight: viewStub,
  TouchableWithoutFeedback: viewStub,
  TouchableNativeFeedback: viewStub,
  Pressable: viewStub,
  Modal: viewStub,
  SafeAreaView: viewStub,
  KeyboardAvoidingView: viewStub,
  ActivityIndicator: viewStub,
  RefreshControl: viewStub,
  Switch: 'input',
  Slider: 'input',
  WebView: viewStub,
  DrawerLayoutAndroid: viewStub,
  // Misc
  useColorScheme: () => 'light',
  useWindowDimensions: () => ({ width: 375, height: 812, scale: 1, fontScale: 1 }),
  findNodeHandle: () => null,
  unstable_batchedUpdates: (fn) => fn(),
  requireNativeComponent: () => viewStub,
};
