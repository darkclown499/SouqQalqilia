import { corsHeaders } from '../_shared/cors.ts';

const APP_SCHEME = 'souqqalqilya';
const IOS_APP_STORE = 'https://apps.apple.com/app/id6742678345'; // replace with real App Store ID
const ANDROID_PLAY_STORE = 'https://play.google.com/store/apps/details?id=app.plankton.souq_qalqilya';

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

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>سوق قلقيلية</title>
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
    <h1>سوق قلقيلية</h1>
    <p>جاري فتح التطبيق لعرض الإعلان...</p>
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
