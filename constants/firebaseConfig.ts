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
  apiKey: '',            // ← paste your FIREBASE_WEB_API_KEY here
  projectId: '',         // ← paste your FIREBASE_PROJECT_ID here
  appId: '',             // ← paste your FIREBASE_APP_ID here
  authDomain: '',        // ← typically: <projectId>.firebaseapp.com
  storageBucket: '',     // ← typically: <projectId>.appspot.com
  messagingSenderId: '', // ← from Firebase project settings (optional)
};
