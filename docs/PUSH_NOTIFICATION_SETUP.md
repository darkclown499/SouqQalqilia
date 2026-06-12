# Push Notification Setup Guide — Souq Qalqilya

## Current Status

| Platform | Status | Root Cause |
|----------|--------|-----------|
| Android | ❌ Not working | `google-services.json` missing from repo root |
| iOS | ❌ Not working | APNs p8 key not configured in EAS credentials |
| Token Registration | ⚠️ Only 9/326 users | `registerPushToken()` was only called on first SIGNED_IN, not on every app open |

---

## Fix 1: Android — Add `google-services.json`

### Steps:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create one with `app.plankton.souq_qalqilya`)
3. Go to **Project Settings → Your apps → Android app**
4. The package name must be: `app.plankton.souq_qalqilya`
5. Download `google-services.json`
6. Place it at the **root of this repository** (`./google-services.json`)
7. `app.json` already has `"googleServicesFile": "./google-services.json"` configured

### Verify:
```bash
# After placing the file, confirm it's at root:
ls -la google-services.json
```

---

## Fix 2: iOS — Configure APNs P8 Key in EAS

The logs show: `"Could not find APNs credentials for app.plankton.souq-qalqilya"`

### Option A: EAS CLI (Recommended)
```bash
eas credentials
# Select: iOS → production → Push Notifications → Add
# Upload your .p8 key from Apple Developer portal
```

### Option B: expo.dev Dashboard
1. Go to https://expo.dev → your project → Credentials → iOS
2. Under "Push Notifications", add your **APNs Auth Key**
3. Provide:
   - **Key ID**: from Apple Developer → Certificates → Keys
   - **Apple Team ID**: from Apple Developer → Membership
   - **Bundle ID**: `app.plankton.souq-qalqilya`

### Generate APNs Key:
1. Apple Developer → Certificates, Identifiers & Profiles → Keys
2. Create a new key with **Apple Push Notifications service (APNs)** enabled
3. Download the `.p8` file (you can only download it once!)

---

## Fix 3: Re-register Tokens for Existing Users

After fixing credentials, existing users need to re-register their tokens.
The updated `registerPushToken()` in `hooks/useChat.ts` now:
- Runs on every `SIGNED_IN` auth event
- Runs every time the app comes to foreground (`AppState active`)  
- Logs the token to console for debugging
- Compares against cached token to avoid redundant DB writes

To force all existing users to re-register: **they simply need to open the app once.**

---

## Health Check — Test a Specific Device

### Step 1: Get your device's Expo Push Token
Open the app in Metro/development mode and look for:
```
[PushToken] ✅ Expo Push Token: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
```

### Step 2: Send a test notification via cURL
```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[YOUR_TOKEN_HERE]",
    "title": "Test Notification 🔔",
    "body": "Push notifications are working!",
    "sound": "default",
    "priority": "high",
    "data": { "type": "test" }
  }'
```

**Expected response (success):**
```json
{"data":{"status":"ok","id":"XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"}}
```

**Android failure response (missing FCM):**
```json
{"data":{"status":"error","message":"Could not find FCM credentials..."}}
```

**iOS failure response (missing APNs):**
```json
{"data":{"status":"error","message":"Could not find APNs credentials..."}}
```

### Step 3: Use the Admin Broadcast dry-run
In the Admin panel → campaign button → enter title/message → the `dry_run` mode
shows how many valid tokens are found without sending.

---

## Notification Flow Diagram

```
User opens app
    ↓
AppState 'active' event (every foreground)
    ↓
registerPushToken()
    ↓
getExpoPushTokenAsync({ projectId: 'c102ae5b-...' })
    ↓
[Android: requires google-services.json + FCM]
[iOS: requires APNs p8 key in EAS credentials]
    ↓
Token returned → compare with AsyncStorage cache
    ↓
If changed: save to user_profiles.push_token in Supabase
    ↓
When someone sends a message:
    notifyRecipient() → push-notify edge function
    ↓
Edge function: fetches push_token from user_profiles
    ↓
POST to https://exp.host/--/api/v2/push/send
    ↓
Expo Push Service → FCM (Android) / APNs (iOS)
    ↓
Device receives notification
```

---

## Troubleshooting Checklist

- [ ] `google-services.json` exists at repo root
- [ ] APNs p8 key uploaded to EAS (run `eas credentials`)
- [ ] Testing on **real device** (push notifications never work on simulators/emulators)
- [ ] App built with EAS Build (not Expo Go, which uses Expo's own credentials)
- [ ] `[PushToken] ✅` logs visible in Metro console after app open
- [ ] `user_profiles.push_token` column is not null for test user (check DB tab in OnSpace Cloud)
