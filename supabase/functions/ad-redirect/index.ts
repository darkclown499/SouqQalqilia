import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_SCHEME = 'souqqalqilya';
const IOS_APP_STORE = 'https://apps.apple.com/app/id6742678345';
const ANDROID_PLAY_STORE = 'https://play.google.com/store/apps/details?id=app.plankton.souq_qalqilya';
const DEFAULT_OG_IMAGE = 'https://dmyjmmpytwppyfsjdmyj.backend.onspace.ai/storage/v1/object/public/ad-images/og-default.jpg';
const SITE_NAME = 'سوق قلقيلية';

/**
 * Converts a Supabase Storage public URL to an Image Transform URL
 * cropped/resized to 1200×630 (1.91:1) for perfect OG previews.
 *
 * Input:  https://<host>/storage/v1/object/public/<bucket>/<path>
 * Output: https://<host>/storage/v1/render/image/public/<bucket>/<path>?width=1200&height=630&resize=cover&quality=80
 *
 * Non-Supabase URLs are returned unchanged.
 */
function toOgImageUrl(url: string): string {
  try {
    const u = new URL(url);
    const OBJECT_PREFIX = '/storage/v1/object/public/';
    const RENDER_PREFIX = '/storage/v1/render/image/public/';

    if (!u.pathname.startsWith(OBJECT_PREFIX)) return url; // not a Supabase storage URL

    // Swap path prefix
    u.pathname = RENDER_PREFIX + u.pathname.slice(OBJECT_PREFIX.length);

    // Set OG dimensions — cover crop keeps the subject centred
    u.searchParams.set('width', '1200');
    u.searchParams.set('height', '630');
    u.searchParams.set('resize', 'cover');
    u.searchParams.set('quality', '80');

    return u.toString();
  } catch {
    return url; // malformed URL — fall back to original
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const adId = url.searchParams.get('id') ?? '';

  if (!adId) {
    return new Response('Missing ad ID', { status: 400 });
  }

  const deepLink = `${APP_SCHEME}://ad/${adId}`;
  const ua = req.headers.get('user-agent') ?? '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const storeLink = isIOS ? IOS_APP_STORE : isAndroid ? ANDROID_PLAY_STORE : IOS_APP_STORE;

  // ── Fetch ad data for OG tags ──────────────────────────────────────────────
  let ogTitle = SITE_NAME;
  let ogDescription = 'اكتشف آلاف الإعلانات في سوق قلقيلية';
  let ogImage = DEFAULT_OG_IMAGE;
  let ogPrice = '';

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: ad } = await supabase
      .from('ads')
      .select(`
        title, description, price, location,
        ad_images(url, position)
      `)
      .eq('id', adId)
      .single();

    if (ad) {
      ogTitle = ad.title ?? SITE_NAME;

      // Build description: price + location + truncated text
      const priceStr = ad.price === 0 ? 'مجاني' : `₪${Number(ad.price).toLocaleString('ar-SA')}`;
      ogPrice = priceStr;
      const locationStr = ad.location ? ` · ${ad.location}` : '';
      const descSnippet = ad.description
        ? ad.description.slice(0, 120) + (ad.description.length > 120 ? '...' : '')
        : '';
      ogDescription = `${priceStr}${locationStr}${descSnippet ? ' — ' + descSnippet : ''}`;

      // First image sorted by position → transform to OG-optimised 1200×630
      if (ad.ad_images && ad.ad_images.length > 0) {
        const sorted = [...ad.ad_images].sort((a: any, b: any) => a.position - b.position);
        if (sorted[0]?.url) ogImage = toOgImageUrl(sorted[0].url);
      }
    }
  } catch (_) {
    // Fail silently — still render the page with defaults
  }

  const safeTitle = escapeHtml(ogTitle);
  const safeDesc = escapeHtml(ogDescription);
  const safeImage = escapeHtml(ogImage);
  const pageUrl = escapeHtml(`https://dmyjmmpytwppyfsjdmyj.backend.onspace.ai/functions/v1/ad-redirect?id=${adId}`);

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${safeTitle} — سوق قلقيلية</title>

  <!-- Open Graph / WhatsApp / Telegram -->
  <meta property="og:type" content="product"/>
  <meta property="og:site_name" content="سوق قلقيلية"/>
  <meta property="og:url" content="${pageUrl}"/>
  <meta property="og:title" content="${safeTitle}"/>
  <meta property="og:description" content="${safeDesc}"/>
  <meta property="og:image" content="${safeImage}"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:locale" content="ar_SA"/>

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${safeTitle}"/>
  <meta name="twitter:description" content="${safeDesc}"/>
  <meta name="twitter:image" content="${safeImage}"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #0A6E5C 0%, #064d40 100%);
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
    }
    .card {
      background: #fff; border-radius: 24px;
      padding: 40px 32px; max-width: 380px; width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    }
    .logo {
      font-size: 48px; margin-bottom: 12px;
    }
    h1 {
      color: #0A6E5C; font-size: 22px; font-weight: 800;
      margin-bottom: 8px;
    }
    p {
      color: #64748b; font-size: 15px; line-height: 1.6;
      margin-bottom: 28px;
    }
    .btn {
      display: block; width: 100%;
      background: #0A6E5C; color: #fff;
      padding: 16px; border-radius: 14px;
      text-decoration: none; font-size: 16px; font-weight: 700;
      margin-bottom: 12px;
      transition: opacity 0.2s;
    }
    .btn:active { opacity: 0.85; }
    .btn-outline {
      background: transparent; color: #0A6E5C;
      border: 2px solid #0A6E5C;
    }
    .spinner {
      width: 36px; height: 36px; border: 3px solid #e2e8f0;
      border-top-color: #0A6E5C; border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🏪</div>
    <h1>${safeTitle}</h1>
    <p>${ogPrice ? `<strong style="color:#0A6E5C">${escapeHtml(ogPrice)}</strong> — ` : ''}جاري فتح التطبيق لعرض الإعلان...</p>
    <div class="spinner" id="spinner"></div>
    <a href="${deepLink}" class="btn" id="openBtn">فتح في التطبيق</a>
    <a href="${storeLink}" class="btn btn-outline" id="storeBtn" style="display:none;">
      ${isIOS ? 'تحميل من App Store' : isAndroid ? 'تحميل من Google Play' : 'تحميل التطبيق'}
    </a>
  </div>
  <script>
    // Attempt deep link immediately
    window.location.href = '${deepLink}';

    // After 2.5 seconds, if still on page → app not installed → show store button
    setTimeout(function() {
      document.getElementById('spinner').style.display = 'none';
      document.getElementById('storeBtn').style.display = 'block';
      document.querySelector('p').textContent = 'هل لديك تطبيق سوق قلقيلية؟';
    }, 2500);
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...corsHeaders,
    },
  });
});
