// Shim for expo-web-browser — regenerated on every Metro start.
// Loads the real package and patches any missing methods with safe stubs.

let real = {};
try {
  // NOTE: metro.config.js resolves 'expo-web-browser' → expo-web-browser-resolved.js
  // which in turn loads the actual package. This require() is intentionally calling
  // the resolved shim (not circular) because metro.config.js uses resolveRequest
  // only for the module name 'expo-web-browser', and here we're inside a shim file,
  // NOT the module named 'expo-web-browser' — so Metro resolves it correctly.
  real = require('expo-web-browser');
} catch (e) {
  console.warn('[expo-web-browser shim] Failed to load real package:', e?.message);
  real = {};
}

// Patch any missing methods with safe stubs
if (typeof real.maybeCompleteAuthSession !== 'function') {
  real.maybeCompleteAuthSession = function () { return { type: 'success' }; };
}
if (typeof real.warmUpAsync !== 'function') {
  real.warmUpAsync = async function () {};
}
if (typeof real.coolDownAsync !== 'function') {
  real.coolDownAsync = async function () {};
}
if (typeof real.openAuthSessionAsync !== 'function') {
  console.warn('[expo-web-browser shim] openAuthSessionAsync not found — Google OAuth will not work');
  real.openAuthSessionAsync = async function (url) {
    console.warn('[expo-web-browser shim] openAuthSessionAsync stub called with URL:', url);
    return { type: 'cancel' };
  };
}
if (typeof real.openBrowserAsync !== 'function') {
  real.openBrowserAsync = async function () { return { type: 'cancel' }; };
}
if (typeof real.dismissBrowser !== 'function') {
  real.dismissBrowser = function () {};
}
if (typeof real.dismissAuthSession !== 'function') {
  real.dismissAuthSession = function () {};
}

module.exports = real;
