/**
 * Expo config plugin — enforces production-safe AndroidManifest.xml flags.
 *
 * Fixes applied:
 *   1. android:allowBackup="false"
 *   2. android:usesCleartextTraffic="false"
 *   3. android:debuggable="false"
 *   4. android:networkSecurityConfig → HTTPS-only
 *   5. Stripe / CropImage exported activities protected
 *   6. Unexported components locked down
 *   7. Forbidden permissions stripped (ACTIVITY_RECOGNITION, READ_MEDIA_VIDEO, etc.)
 *   8. Play Billing Library forced to ≥6.0.1 via Gradle resolution strategy
 *   9. Post-merge XML patch removes any permission that survived manifest merge
 */
// Resolve @expo/config-plugins with multi-strategy fallback.
// Strategy order:
//   1. Project's own node_modules (normal installed build)
//   2. Walk up from require.main.filename (EAS CLI entry point)
//   3. Known global eas-cli installation paths
//   4. Direct require as last resort
const _configPlugins = (() => {
  const _path = require('path');

  const tryLoad = (searchPath) => {
    try {
      return require(require.resolve('@expo/config-plugins', { paths: [searchPath] }));
    } catch (_) { return null; }
  };

  // 1. Project node_modules
  let r = tryLoad(_path.resolve(__dirname, '..'));
  if (r) return r;

  // 2. Walk up from the EAS CLI main entry (require.main)
  if (require.main && require.main.filename) {
    let dir = _path.dirname(require.main.filename);
    for (let i = 0; i < 6; i++) {
      r = tryLoad(dir);
      if (r) return r;
      const up = _path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }

  // 3. Known global eas-cli paths (Linux/macOS CI environments)
  const globalCandidates = [
    '/usr/local/lib/node_modules/eas-cli',
    '/usr/lib/node_modules/eas-cli',
    '/opt/homebrew/lib/node_modules/eas-cli',
    '/usr/local/lib/node_modules/@expo/eas-cli',
  ];
  for (const p of globalCandidates) {
    r = tryLoad(p);
    if (r) return r;
  }

  // 4. Direct require — works when Node's module resolution finds it on PATH
  try { return require('@expo/config-plugins'); } catch (_) {}

  throw new Error('[withProductionManifest] Cannot resolve @expo/config-plugins — please run npm install first.');
})();
const { withAndroidManifest, withDangerousMod, withAppBuildGradle } = _configPlugins;
const path = require('path');
const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Inject network_security_config.xml (HTTPS-only)
// ─────────────────────────────────────────────────────────────────────────────
const withNetworkSecurityConfig = (config) => {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const xmlDir = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'res', 'xml'
      );
      if (!fs.existsSync(xmlDir)) fs.mkdirSync(xmlDir, { recursive: true });

      fs.writeFileSync(
        path.join(xmlDir, 'network_security_config.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!-- HTTPS only — cleartext (HTTP) traffic is prohibited -->
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`,
        'utf8'
      );
      return config;
    },
  ]);
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Patch <application> flags + lock exported components
// ─────────────────────────────────────────────────────────────────────────────
const withSecureManifest = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) return config;

    // Add tools namespace to manifest root so tools:node="remove" works
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    // <application> hardening
    const app$ = application.$ || {};
    app$['android:allowBackup']           = 'false';
    app$['android:usesCleartextTraffic']  = 'false';
    app$['android:debuggable']            = 'false';
    app$['android:networkSecurityConfig'] = '@xml/network_security_config';
    application.$ = app$;

    // Activities that must stay exported but need a permission guard
    const SENSITIVE_EXPORTED = [
      'com.stripe.android.link.LinkRedirectHandlerActivity',
      'com.stripe.android.payments.StripeBrowserProxyReturnActivity',
      'com.stripe.android.financialconnections.FinancialConnectionsSheetRedirectActivity',
      'com.canhub.cropper.CropImageActivity',
    ];

    const FORCE_UNEXPORTED = [
      'com.stripe.android.payments.paymentlauncher.PaymentLauncherConfirmationActivity',
      'com.stripe.android.googlepaylauncher.GooglePayLauncherActivity',
      'com.stripe.android.googlepaylauncher.GooglePayPaymentMethodLauncherActivity',
    ];

    (application.activity || []).forEach((activity) => {
      const name = activity.$?.['android:name'];
      if (!name) return;
      if (FORCE_UNEXPORTED.includes(name)) {
        activity.$['android:exported'] = 'false';
      }
      if (SENSITIVE_EXPORTED.includes(name)) {
        activity.$['android:exported']   = 'true';
        activity.$['android:permission'] = 'android.permission.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION';
      }
    });

    // Lock any service/receiver that is exported without a permission
    const lockComponents = (list) => {
      (list || []).forEach((component) => {
        const c$ = component.$ || {};
        if (c$['android:exported'] === 'true' && !c$['android:permission']) {
          const hasIntentFilter = (component['intent-filter'] || []).length > 0;
          if (!hasIntentFilter) component.$['android:exported'] = 'false';
        }
      });
    };
    lockComponents(application.service);
    lockComponents(application.receiver);

    return config;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Strip forbidden <uses-permission> via XML AST (in-memory pass)
// AND inject tools:node="remove" markers so Gradle manifest merger also strips
// any permission re-injected by transitive dependencies at compile time.
// ─────────────────────────────────────────────────────────────────────────────
const FORBIDDEN_PERMISSIONS = new Set([
  // Media — READ_MEDIA_VIDEO is flagged by Google Play policy
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.MANAGE_EXTERNAL_STORAGE',

  // Foreground service types (policy violation)
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_CAMERA',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.FOREGROUND_SERVICE_HEALTH',
  'android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',

  // Location
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',

  // Sensors / Health — ACTIVITY_RECOGNITION flagged by Google Play policy
  'android.permission.ACTIVITY_RECOGNITION',
  'android.permission.HIGH_SAMPLING_RATE_SENSORS',
  'android.permission.BODY_SENSORS',
  'android.permission.BODY_SENSORS_BACKGROUND',
  'android.permission.RECORD_AUDIO',

  // Overlay / System
  'android.permission.SYSTEM_ALERT_WINDOW',

  // Contacts / Calendar / Telephony
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.GET_ACCOUNTS',
  'android.permission.READ_CALENDAR',
  'android.permission.WRITE_CALENDAR',
  'android.permission.READ_PHONE_STATE',
  'android.permission.READ_PHONE_NUMBERS',
  'android.permission.PROCESS_OUTGOING_CALLS',
  'android.permission.SEND_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.READ_SMS',

  // Biometrics
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
]);

const withStripForbiddenPermissions = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure tools namespace is declared on <manifest> root
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const filter = (list) =>
      (list || []).filter((p) => !FORBIDDEN_PERMISSIONS.has(p.$?.['android:name'] ?? ''));

    const before = (manifest['uses-permission'] || []).length;
    manifest['uses-permission']        = filter(manifest['uses-permission']);
    manifest['uses-permission-sdk-23'] = filter(manifest['uses-permission-sdk-23']);
    const after = (manifest['uses-permission'] || []).length;

    // Inject tools:node="remove" markers for every forbidden permission.
    // These survive Gradle manifest merge and instruct aapt to strip any
    // copy re-injected by a transitive dependency (the CORRECT approach).
    const existing = new Set(
      (manifest['uses-permission'] || []).map((p) => p.$?.['android:name'])
    );

    const removeMarkers = [];
    FORBIDDEN_PERMISSIONS.forEach((perm) => {
      if (!existing.has(perm)) {
        removeMarkers.push({
          $: {
            'android:name': perm,
            'tools:node': 'remove',
          },
        });
      }
    });

    if (removeMarkers.length > 0) {
      manifest['uses-permission'] = [
        ...(manifest['uses-permission'] || []),
        ...removeMarkers,
      ];
      console.log(`[withProductionManifest] Injected ${removeMarkers.length} tools:node="remove" markers`);
    }

    if (before !== after) {
      console.log(`[withProductionManifest] Stripped ${before - after} forbidden permission(s) from AST`);
    }
    return config;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Post-merge XML patch (regex safety net on the compiled file)
// Runs AFTER all other plugins have merged the manifest — catches any permission
// that survived the AST pass because a library injected it at Gradle merge time.
// ─────────────────────────────────────────────────────────────────────────────
const withPostMergePermissionPatch = (config) => {
  return withDangerousMod(config, [
    'android',
    (config) => {
      // Target the pre-compiled manifest that Gradle will process
      const manifestPath = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'AndroidManifest.xml'
      );

      if (!fs.existsSync(manifestPath)) return config;

      let xml = fs.readFileSync(manifestPath, 'utf8');
      let removedCount = 0;

      FORBIDDEN_PERMISSIONS.forEach((perm) => {
        // Match both <uses-permission and <uses-permission-sdk-23
        // Use /g flag on replace so ALL dots in the permission name are escaped
        const escapedPerm = perm.replace(/\./g, '\\.');
        const re = new RegExp(
          `\\s*<uses-permission[^>]*android:name="${escapedPerm}"[^/]*/?>`,
          'g'
        );
        const newXml = xml.replace(re, '');
        if (newXml !== xml) {
          removedCount++;
          xml = newXml;
        }
      });

      if (removedCount > 0) {
        fs.writeFileSync(manifestPath, xml, 'utf8');
        console.log(`[withProductionManifest] Post-merge patch removed ${removedCount} forbidden permission(s) from AndroidManifest.xml`);
      }

      return config;
    },
  ]);
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — Force Play Billing Library ≥ 6.0.1
// Google Play rejects apps using the legacy AIDL billing API.
// This adds a Gradle resolution strategy that upgrades any transitive
// dependency pulling in an older version.
// ─────────────────────────────────────────────────────────────────────────────
const withPlayBillingUpgrade = (config) => {
  return withAppBuildGradle(config, (config) => {
    const gradle = config.modResults.contents;

    // Avoid double-patching on repeated prebuild runs
    if (gradle.includes('// [withProductionManifest] Play Billing upgrade')) {
      return config;
    }

    // Insert a configurations block that forces the billing library version
    const billingBlock = `
// [withProductionManifest] Play Billing upgrade — forces ≥ 6.0.1 to satisfy Google Play policy
configurations.all {
    resolutionStrategy {
        force 'com.android.billingclient:billing:6.2.1'
        force 'com.android.billingclient:billing-ktx:6.2.1'
    }
}
`;

    // Append at end of file to avoid matching nested dependencies{} blocks
    // inside android{} or other blocks which would break the build
    const patched = gradle.trimEnd() + '\n' + billingBlock;

    config.modResults.contents = patched;
    console.log('[withProductionManifest] Patched app/build.gradle: Play Billing Library → 6.2.1');
    return config;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — Inject network_security_config.xml (HTTPS-only) — already Step 1
// ─────────────────────────────────────────────────────────────────────────────
// (handled above)

// ─────────────────────────────────────────────────────────────────────────────
// Compose all mods (order matters — strip runs last to catch merged permissions)
// ─────────────────────────────────────────────────────────────────────────────
const withProductionManifest = (config) => {
  config = withNetworkSecurityConfig(config);        // res/xml/network_security_config.xml
  config = withSecureManifest(config);               // <application> flags + component lock
  config = withStripForbiddenPermissions(config);    // AST permission strip
  config = withPostMergePermissionPatch(config);     // Regex safety net on compiled XML
  config = withPlayBillingUpgrade(config);           // Gradle: billing lib 6.2.1
  return config;
};

module.exports = withProductionManifest;
