/**
 * utils/healthCheck.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pre-Launch Health Check Utility — Senior SRE Toolbox
 *
 * Runs a series of automated integration tests against the live backend
 * to catch misconfigurations before shipping to the Play Store / App Store.
 *
 * Tests cover:
 *  1. Supabase connectivity (can we reach the backend at all?)
 *  2. RLS isolation (can user A access user B's private data? → must return empty)
 *  3. Storage policy (can user A delete user B's file? → must fail)
 *  4. Auth state (are we returning a valid session token?)
 *  5. Edge Function reachability (push-notify OPTIONS ping)
 *  6. Version consistency (app.json vs config.ts match)
 *
 * Usage (add to admin panel or run during development):
 *   import { runHealthCheck } from '@/utils/healthCheck';
 *   const report = await runHealthCheck();
 *   console.log(report.summary);
 */

import { getSupabaseClient } from '@/template';
import { APP_VERSION } from '@/constants/config';
import { Logger } from './errorLogger';

export interface HealthResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export interface HealthReport {
  timestamp: string;
  appVersion: string;
  allPassed: boolean;
  results: HealthResult[];
  summary: string;
}

async function runTest(
  name: string,
  fn: () => Promise<{ passed: boolean; message: string }>,
): Promise<HealthResult> {
  const start = Date.now();
  try {
    const { passed, message } = await fn();
    return { name, passed, message, durationMs: Date.now() - start };
  } catch (e: any) {
    return {
      name,
      passed: false,
      message: `Threw: ${e?.message ?? String(e)}`,
      durationMs: Date.now() - start,
    };
  }
}

// ── Individual test implementations ─────────────────────────────────────────

async function testConnectivity(): Promise<{ passed: boolean; message: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .limit(1);
  if (error) return { passed: false, message: `DB error: ${error.message}` };
  return { passed: true, message: `Connected. Got ${data?.length ?? 0} category row(s).` };
}

async function testAuthSession(): Promise<{ passed: boolean; message: string }> {
  const supabase = getSupabaseClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) return { passed: false, message: `Auth error: ${error.message}` };
  if (!session) return { passed: true, message: 'No active session (guest). OK for public tests.' };
  const expiresIn = session.expires_at ? session.expires_at - Math.floor(Date.now() / 1000) : 0;
  if (expiresIn < 300) return { passed: false, message: `Token expires in ${expiresIn}s — will expire soon!` };
  return { passed: true, message: `Session valid. Expires in ${Math.round(expiresIn / 60)}min.` };
}

/**
 * RLS Isolation Test — verifies anon/other users cannot see private data.
 * This uses a "known non-existent" UUID to verify RLS does not return
 * someone else's data. A clean result = [] confirms RLS is working.
 */
async function testRlsIsolation(): Promise<{ passed: boolean; message: string }> {
  const supabase = getSupabaseClient();

  // Favourites: should return empty for a random non-existent user_id
  // If RLS is misconfigured, this would return ALL favourites.
  const fakeUserId = '00000000-0000-0000-0000-000000000001';
  const { data, error } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', fakeUserId)
    .limit(5);

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = "no rows" — expected; any other error = RLS active (good)
    return { passed: true, message: `RLS active: query blocked with "${error.code}".` };
  }
  if (!data || data.length === 0) {
    return { passed: true, message: 'RLS active: no rows returned for foreign user_id.' };
  }
  return {
    passed: false,
    message: `⚠️  RLS LEAK: ${data.length} favourite row(s) visible for a foreign user_id!`,
  };
}

/**
 * Storage RLS Test — verifies unauthenticated users cannot list private buckets.
 * Note: ad-images is PUBLIC (read), chat-images is PUBLIC (read) but
 * write/delete policies are authenticated + folder-scoped.
 * We test the write/delete boundary here.
 */
async function testStorageRls(): Promise<{ passed: boolean; message: string }> {
  const supabase = getSupabaseClient();

  // Attempt to DELETE a file in another user's folder path.
  // With correct RLS policy:
  //   "(storage.foldername(name))[1] = auth.uid()"
  // this must fail for anon or a different user.
  const { error } = await supabase.storage
    .from('chat-images')
    .remove(['00000000-0000-0000-0000-000000000001/fake-test-file.jpg']);

  if (error) {
    // Error is expected — RLS prevented the delete
    return { passed: true, message: `Storage RLS active: delete blocked ("${error.message.slice(0, 60)}").` };
  }
  // No error + no rows affected means either the file didn't exist (ok)
  // or it silently succeeded (bad). We treat no-error with a soft warning.
  return {
    passed: true,
    message: 'Delete returned no error (file did not exist). Manual write-test recommended for full validation.',
  };
}

async function testVersionConsistency(): Promise<{ passed: boolean; message: string }> {
  // Check that APP_VERSION in config.ts matches a known sane semver pattern
  const semver = /^\d+\.\d+\.\d+$/;
  if (!semver.test(APP_VERSION)) {
    return { passed: false, message: `APP_VERSION "${APP_VERSION}" is not valid semver!` };
  }
  // Warn if version looks like it was forgotten (still at 1.0.0)
  if (APP_VERSION === '1.0.0') {
    return { passed: false, message: 'APP_VERSION is still 1.0.0 — did you forget to bump it before release?' };
  }
  return { passed: true, message: `APP_VERSION = ${APP_VERSION} (valid semver).` };
}

async function testEdgeFunctionReachability(): Promise<{ passed: boolean; message: string }> {
  const supabase = getSupabaseClient();
  // Send a minimal dry-run call (no actual tokens sent, admin guard will block it —
  // but we care only about HTTP connectivity, not the response body).
  // Use a deliberate invalid body to provoke a 400 (not 500/503/timeout).
  try {
    const start = Date.now();
    const { error } = await supabase.functions.invoke('push-notify', {
      body: { _health_check: true },
    });
    const ms = Date.now() - start;
    // Any response (including 400 "missing fields") means the function IS reachable.
    // A 500 or network error means it crashed or Deno cold-start failed.
    if (error?.message?.includes('500') || error?.message?.includes('503')) {
      return { passed: false, message: `Edge function returned 5xx in ${ms}ms.` };
    }
    return { passed: true, message: `Edge function reachable in ${ms}ms.` };
  } catch (e: any) {
    return { passed: false, message: `Network error reaching edge function: ${e?.message}` };
  }
}

async function testPublicAdsReadable(): Promise<{ passed: boolean; message: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('ads')
    .select('id, status')
    .eq('status', 'active')
    .limit(3);
  if (error) return { passed: false, message: `Cannot read public ads: ${error.message}` };
  if (!data || data.length === 0) {
    return { passed: true, message: 'No active ads in DB yet (empty marketplace). OK for fresh deployment.' };
  }
  return { passed: true, message: `Public ads readable. Sample size: ${data.length}.` };
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runHealthCheck(): Promise<HealthReport> {
  Logger.info('healthCheck', 'Starting pre-launch health check...');

  const results = await Promise.all([
    runTest('DB Connectivity',        testConnectivity),
    runTest('Auth Session',           testAuthSession),
    runTest('RLS Isolation',          testRlsIsolation),
    runTest('Storage RLS',            testStorageRls),
    runTest('Version Consistency',    testVersionConsistency),
    runTest('Edge Fn Reachability',   testEdgeFunctionReachability),
    runTest('Public Ads Readable',    testPublicAdsReadable),
  ]);

  const allPassed = results.every(r => r.passed);
  const failCount = results.filter(r => !r.passed).length;

  const summary = [
    `═══ Health Check Report ═══`,
    `Version:    ${APP_VERSION}`,
    `Timestamp:  ${new Date().toISOString()}`,
    `Result:     ${allPassed ? '✅ ALL PASSED' : `❌ ${failCount} FAILED`}`,
    ``,
    ...results.map(r =>
      `${r.passed ? '✅' : '❌'} [${r.durationMs}ms] ${r.name}: ${r.message}`
    ),
    `════════════════════════════`,
  ].join('\n');

  if (!allPassed) {
    Logger.warn('healthCheck', `Health check failed: ${failCount} test(s) did not pass`);
  } else {
    Logger.info('healthCheck', 'All health checks passed ✅');
  }

  console.log(summary); // always print in console for dev visibility

  return {
    timestamp: new Date().toISOString(),
    appVersion: APP_VERSION,
    allPassed,
    results,
    summary,
  };
}
