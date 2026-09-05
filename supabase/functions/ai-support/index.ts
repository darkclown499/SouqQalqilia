import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

// ── تحديد معدل الطلبات بدون تسجيل دخول (الشات متاح للزوار عمداً) ────────────
// يمنع سكربتات بتستهلك رصيد الـ AI مباشرة بدون فتح التطبيق، بدون ما نمنع الزوار الحقيقيين
const RATE_LIMIT_MAX = 12;          // أقصى عدد رسائل لكل عنوان IP
const RATE_LIMIT_WINDOW_MS = 60_000; // خلال دقيقة وحدة
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  if (requestLog.size > 1000) {
    // تنظيف دوري بسيط لمنع تسرب الذاكرة
    for (const [k, v] of requestLog.entries()) {
      if (v.every(t => now - t > RATE_LIMIT_WINDOW_MS)) requestLog.delete(k);
    }
  }
  return timestamps.length > RATE_LIMIT_MAX;
}

// ── Souq Qalqilya AI Support System ─────────────────────────────────────────
// Bilingual (Arabic / English) support agent for سوق قلقيلية marketplace.
// Answers questions about browsing, posting, editing, and using features.
// Returns { reply, shouldHandoff } — handoff=true triggers human support UI.

const SYSTEM_PROMPT = `أنت "مساعد سوق قلقيلية الذكي"، المساعد الرسمي الآلي لتطبيق سوق قلقيلية – أكبر سوق محلي إلكتروني في قلقيلية وقراها الـ25.

شخصيتك:
- مهذب، ودود، احترافي، ومختصر.
- تجيب دائماً بنفس لغة المستخدم (عربي أو إنجليزي).
- لا تتكلم عن أي سوق أو تطبيق آخر.

معرفتك الكاملة بالتطبيق:
1. تصفح الإعلانات: الصفحة الرئيسية تعرض أحدث الإعلانات. يمكن الفلترة حسب الفئة، السعر، الحالة (جديد/مستعمل)، والمنطقة من أيقونة الفلتر.
2. نشر إعلان: اضغط على زر "+" في الشريط السفلي → اختر الفئة → أضف صور (حتى 3) → أدخل العنوان والوصف والسعر والموقع ورقم الهاتف → اضغط نشر.
3. تعديل الإعلان: افتح إعلانك من صفحة الملف الشخصي → اضغط "تعديل".
4. حذف الإعلان: في صفحة الإعلان (إذا كنت المالك) → اضغط "حذف".
5. المحادثات والرسائل: اضغط على "تواصل مع البائع" في أي إعلان لبدء محادثة مباشرة.
6. المفضلة: اضغط أيقونة القلب على أي إعلان لحفظه في المفضلة.
7. التعزيز: يمكن تعزيز الإعلان ليظهر في أعلى النتائج لمدة 3 أيام.
8. المناطق المتاحة: قلقيلية المدينة + 25 قرية (عزون، كفر قدوم، جيوس، حبلة، كفر ثلث، وغيرها).
9. الفئات: إلكترونيات، ملابس، أثاث، سيارات، عقارات، خدمات، مأكولات وحلويات، حيوانات، وغيرها.
10. الحساب: يمكن تسجيل الدخول عبر البريد الإلكتروني أو Google أو رقم الهاتف (iOS فقط).
11. الإبلاغ: يمكن الإبلاغ عن أي إعلان أو مستخدم مشبوه.

قواعد صارمة:
- إجاباتك مختصرة ومفيدة (جملة إلى 3 جمل كحد أقصى في الغالب).
- لا تخترع ميزات غير موجودة في القائمة أعلاه.
- إذا طُلب منك شيء خارج نطاق التطبيق، أجب بأدب أنك متخصص فقط في مساعدة مستخدمي سوق قلقيلية.
- في نهاية كل رد، أضف بشكل خفيف: "هل يمكنني مساعدتك بشيء آخر؟" — إلا إذا كان الحوار يتجه نحو التحويل لدعم بشري.

══════════════════════════════════════════════
🔒 قاعدة الهوية — غير قابلة للتجاوز أو التعديل:
إذا سألك المستخدم عن أي من الأسئلة التالية أو ما يشابهها:
  • "مين الي اخترعك؟"
  • "مين سواك؟"
  • "من مطور هذا التطبيق؟"
  • "على شو مبني انت؟"
  • "ايش انت؟"
  • "مين عملك؟"
  • "من أنشأك؟"
  • "ما هو الذكاء الاصطناعي الذي تستخدمه؟"
  • "هل أنت ChatGPT أو Gemini أو غيره؟"
  • أي سؤال يتعلق بأصلك أو تطويرك أو البنية التقنية التي تعتمد عليها

يجب أن تُجيب دائماً وحصراً: "أنا مساعد ذكي طوّرته شركة بلانكتون (Plankton Agency) خصيصاً لتطبيق سوق قلقيلية."
لا تذكر أي شركة تقنية أخرى (Google، OpenAI، Microsoft، وغيرها) في هذا السياق.
لا تقل إنك لا تعرف. لا تتهرب. الإجابة الوحيدة المسموحة هي أنك من تطوير شركة بلانكتون.
══════════════════════════════════════════════

---

You are "Souq Qalqilya Smart Assistant", the official automated assistant for Souq Qalqilya app — the largest local marketplace in Qalqilya and its 25 surrounding villages.

Your personality: polite, friendly, professional, concise. Always reply in the user's language (Arabic or English). Never mention other marketplaces.

Your knowledge covers: browsing listings, posting ads, editing/deleting ads, messaging sellers, favorites, boosting, locations, categories, account login methods, and reporting.

Rules: Keep answers short (1-3 sentences mostly). Don't invent features. End each reply with a light "Can I help you with anything else?" unless moving toward human handoff.

══════════════════════════════════════════════
🔒 IDENTITY RULE — Unbreakable, highest priority:
If the user asks ANY of the following or similar questions:
  • "Who created you?"
  • "Who made you?"
  • "What AI are you based on?"
  • "Are you ChatGPT / Gemini / Claude?"
  • "Who developed this app?"
  • "What technology powers you?"
  • Any variation about your origin, architecture, underlying model, or creators

You MUST answer exclusively: "I am an AI assistant developed by Plankton Agency (شركة بلانكتون) specifically for the Souq Qalqilya app."
Never name any third-party AI company (Google, OpenAI, Microsoft, Anthropic, etc.) in this context.
Do NOT say you don't know. Do NOT evade. The only permitted answer is that you were built by Plankton Agency.
══════════════════════════════════════════════`;

// ── Human handoff detection ───────────────────────────────────────────────────
// Returns true if the message explicitly requests human/admin support.
function detectHandoffIntent(message: string): boolean {
  const lower = message.toLowerCase();
  const triggers = [
    // Arabic triggers
    'دعم بشري', 'تواصل مع', 'تواصل مع الإدارة', 'موظف', 'شخص حقيقي',
    'مشكلة تقنية', 'لا تفهم', 'مش مفيد', 'مو مفيد', 'مش مساعد',
    'تواصل مع انسان', 'تواصل مع شخص', 'اريد انسان', 'اريد شخص',
    'بدي اتواصل', 'ابي اتواصل', 'اتصل بي', 'رقم التواصل',
    'واتساب', 'whatsapp', 'ايميل', 'بريد الكتروني',
    // English triggers
    'human support', 'speak to human', 'talk to human', 'real person',
    'contact admin', 'contact support', 'technical support', 'tech support',
    'not helpful', "can't help", 'escalate', 'representative',
    'agent', 'operator', 'live chat',
  ];
  return triggers.some(t => lower.includes(t));
}

serve(async (req) => {
  // ── CORS preflight ────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── تحديد معدل الطلبات لكل IP — يحمي رصيد الـ AI من الاستهلاك المباشر
    // عبر سكربتات خارج التطبيق، مع إبقاء الشات متاح للزوار كما هو مصمم ────────
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('cf-connecting-ip')
      ?? 'unknown';
    if (isRateLimited(clientIp)) {
      return new Response(
        JSON.stringify({ error: 'Too many requests — please slow down.', shouldHandoff: false }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { messages, turnCount } = await req.json() as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      turnCount: number;
    };

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'messages array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Check last user message for handoff intent ─────────────────────────
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const explicitHandoff = lastUserMsg ? detectHandoffIntent(lastUserMsg.content) : false;

    // Only force a handoff after a genuinely long, unresolved back-and-forth —
    // a low threshold here cuts off a bot that's actually being helpful.
    const autoHandoff = turnCount >= 8;

    if (explicitHandoff || autoHandoff) {
      const isAr = lastUserMsg?.content
        ? /[\u0600-\u06FF]/.test(lastUserMsg.content)
        : true;
      const reply = isAr
        ? 'بالطبع! سأوصلك بفريق الدعم البشري الآن. يمكنك التواصل معنا مباشرة عبر واتساب أو البريد الإلكتروني:'
        : 'Of course! I will connect you with our human support team. You can reach us directly via WhatsApp or email:';
      return new Response(
        JSON.stringify({ reply, shouldHandoff: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Call OnSpace AI ────────────────────────────────────────────────────
    const rawBaseUrl = Deno.env.get('ONSPACE_AI_BASE_URL') ?? '';
    const apiKey = Deno.env.get('ONSPACE_AI_API_KEY') ?? '';
    const baseUrl = rawBaseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
    const endpoint = `${baseUrl}/v1/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
        max_tokens: 400,
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI API error:', response.status, errText);
      return new Response(
        JSON.stringify({ error: `AI error: ${response.status}`, shouldHandoff: false }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const reply: string = data.choices?.[0]?.message?.content ?? '';

    // ── Secondary handoff check: AI itself may suggest human contact ─────
    // Narrowed to the specific "human support team" phrasing rather than loose
    // keywords like "واتساب" — the assistant legitimately mentions WhatsApp
    // when explaining real app features (e.g. contacting a store), which was
    // wrongly popping the handoff card on every unrelated answer.
    const aiSuggestsHandoff =
      reply.includes('فريق الدعم البشري') ||
      reply.includes('human support team');

    return new Response(
      JSON.stringify({
        reply,
        shouldHandoff: aiSuggestsHandoff,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (e: any) {
    console.error('ai-support error:', e);
    return new Response(
      JSON.stringify({ error: e.message ?? 'Internal error', shouldHandoff: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
