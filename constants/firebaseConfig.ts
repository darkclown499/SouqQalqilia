/**
 * Firebase client configuration — values are intentionally public.
 * They identify your Firebase project but do not grant admin access.
 *
 * Update from: Firebase Console → Project Settings → Your apps → Web app config
 *
 * NOTE: The FIREBASE_WEB_API_KEY, FIREBASE_PROJECT_ID, and FIREBASE_APP_ID you
 * entered as backend secrets are the same values to place here. Backend secrets
 * cannot be read by the client bundle, so we keep a copy here for client-side
 * Firebase SDK initialization.
 */

// ────────────────────────────────────────────────────────────────────────────
// TODO: Replace the placeholder values below with your actual Firebase project
// values. You already entered these when configuring the backend secrets.
// ────────────────────────────────────────────────────────────────────────────
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAoZEglBVjg1mQRaf8bt_lpDLALGaeKI30',
  projectId: 'sooqqalqilia',
  appId: '1:622640723046:web:e0109779459ac6d2c329a7',
  authDomain: 'sooqqalqilia.firebaseapp.com',
  storageBucket: 'sooqqalqilia.firebasestorage.app',
  messagingSenderId: '622640723046',
  measurementId: 'G-8V5GC52Y2S',
};

/** Returns true only when all required Firebase fields are filled in. */
export function isFirebaseConfigured(): boolean {
  return (
    !!FIREBASE_CONFIG.apiKey &&
    !!FIREBASE_CONFIG.projectId &&
    !!FIREBASE_CONFIG.appId &&
    !!FIREBASE_CONFIG.authDomain
  );
}
