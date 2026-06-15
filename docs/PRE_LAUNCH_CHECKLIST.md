/**
 * Pre-Launch Deployment Checklist — Souq Qalqilya
 * ══════════════════════════════════════════════════════════════
 *
 * Run this before every production EAS Build submission.
 * Paste the output into your release notes.
 *
 * USAGE: node docs/pre-launch-checklist.js
 *        (or review manually against the items below)
 */

# 🚀 Pre-Launch Checklist — سوق قلقيلية

## ① Version Consistency (CRITICAL)
- [ ] `constants/config.ts` → `APP_VERSION` matches `app.json` → `version`
- [ ] `app.json` → `android.versionCode` incremented by 1 from last release
- [ ] `app.json` → `ios.buildNumber` incremented by 1 from last release
- [ ] DB table `app_config` → `min_android_version` updated if this is a forced upgrade

## ② EAS Build — Correct Profile
```bash
# ❌ NEVER submit a development or preview build to stores
eas build --platform android --profile production
eas build --platform ios     --profile production

# ✅ Verify the build type in eas.json:
#    production → buildType: "app-bundle"  (NOT "apk" or debug variant)
#    production → gradleCommand: ":app:bundleRelease"  (NOT assembleDebug)
```

## ③ Environment Variables (CRITICAL)
- [ ] `EXPO_PUBLIC_SUPABASE_URL` is the PRODUCTION URL (not dev/staging)
- [ ] `EXPO_PUBLIC_SUPABASE_ANON_KEY` is the PRODUCTION anon key
- [ ] Both vars are set in EAS Secrets (dashboard) or `eas.json` env section
- [ ] `APP_VARIANT=production` is in `eas.json` production env

## ④ App Store Blockers — iOS
- [ ] `usesAppleSignIn: false` (we removed Apple Sign-In — no implementation exists)
- [ ] `NSMicrophoneUsageDescription` describes voice notes accurately (fixed ✅)
- [ ] No `expo-apple-authentication` plugin without implementation (removed ✅)
- [ ] `ITSAppUsesNonExemptEncryption: false` is present in infoPlist

## ⑤ Google Play Blockers — Android
- [ ] `allowBackup: false` (protects user data) ✅
- [ ] `usesCleartextTraffic: false` (HTTPS only) ✅
- [ ] `targetSdkVersion: 35` (required for 2025+ submissions) ✅
- [ ] All sensitive permissions in `blockedPermissions` list ✅
- [ ] `RECORD_AUDIO` is NOT in `permissions` (voice notes use chat-images bucket, not mic API)

## ⑥ Push Notifications
- [ ] `google-services.json` is the PRODUCTION Firebase config (not dev)
- [ ] `GoogleService-Info.plist` is the PRODUCTION config for iOS
- [ ] `projectId: "c102ae5b-583e-4af3-9643-7f32b9e5f1b1"` matches `app.json` extra.eas.projectId
- [ ] `push-notify` Edge Function is deployed and reachable (run healthCheck.ts)

## ⑦ Database & Backend
- [ ] RLS is enabled on ALL tables (verify in Supabase dashboard)
- [ ] `increment_ad_views` RPC has `SECURITY DEFINER` (fixed ✅)
- [ ] `blurhash` column exists in `ad_images` (added ✅)
- [ ] No leftover test data in production DB (ad_images, messages)
- [ ] `app_config` table has `min_android_version` row set correctly

## ⑧ Final Smoke Test (Real Device)
- [ ] Fresh install → splash → home feed loads within 3s
- [ ] Create account (email OTP) → complete profile → post ad with 3 photos
- [ ] Search, filter by area + price + condition
- [ ] Send chat message → other device receives push notification
- [ ] Block user → their ads disappear from feed
- [ ] Admin panel: broadcast notification → received on test device
- [ ] Force-update flow: set `min_android_version` above current → blocker screen appears

## ⑨ Run Automated Health Check
```typescript
import { runHealthCheck } from '@/utils/healthCheck';
const report = await runHealthCheck();
// ALL 7 tests must PASS before submission
```

## ⑩ Release Notes Template
```
Version X.Y.Z (Build NNN)
• [list user-visible changes]
• Performance improvements and bug fixes

Minimum Android: X.Y.Z
Target SDK: 35 (Android 15)
```
