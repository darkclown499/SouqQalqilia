import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── التحقق من هوية المستخدم — هذه الدالة تستهلك رصيد AI مدفوع،
    // فلا يجوز أن تكون متاحة بدون تسجيل دخول ───────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized — missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized — invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { title, description, language, mode } = await req.json();
    const isRequest = mode === 'product_request';

    if (!title && !description) {
      return new Response(
        JSON.stringify({ error: 'Title or description required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isAr = language === 'ar';

    const systemPrompt = isAr
      ? isRequest
        ? `أنت خبير في صياغة طلبات الشراء لسوق قلقيلية. مهمتك كتابة عنوان واضح وموجز ووصف محترف لطلب شراء منتج.

قواعد صارمة:
- العنوان: جملة واحدة (أقل من 60 حرف) تبدأ بـ "أبحث عن" أو "مطلوب", تصف المنتج المراد شراؤه.
- الوصف: فقرة (3-4 جمل) تشمل: المواصفات المطلوبة، الحالة المفضلة، الميزانية إن وُجدت، وطلب التواصل.
- لا تضع محتوى العنوان داخل الوصف.
- أجب فقط بالشكل المطلوب بدون أي نص إضافي.`
        : `أنت خبير تسويق رقمي متخصص في سوق قلقيلية الفلسطيني. مهمتك كتابة عنوان قصير جذاب ووصف تفصيلي مقنع لإعلانات البيع.

قواعد صارمة:
- العنوان: جملة واحدة قصيرة (أقل من 60 حرف)، يصف المنتج بدقة مع أبرز ميزة.
- الوصف: فقرة كاملة (3-5 جمل) تشمل: الحالة، المميزات، سبب الشراء، أي معلومات إضافية مفيدة.
- لا تضع محتوى العنوان داخل الوصف.
- أجب فقط بالشكل المطلوب بدون أي نص إضافي.`
      : isRequest
        ? `You are an expert in writing buy-request listings for the Qalqilya marketplace. Write a clear title and professional description for a product purchase request.

Strict rules:
- TITLE: One sentence (under 60 chars) starting with "Looking for" or "Wanted:", describing the desired product.
- DESCRIPTION: Paragraph (3-4 sentences) covering: required specs, preferred condition, budget if known, and call to action.
- Never repeat the title content inside the description.
- Reply only in the required format, no extra text.`
        : `You are a digital marketing expert for Qalqilya marketplace. Write a short catchy title and a detailed compelling description for product listings.

Strict rules:
- TITLE: One short sentence (under 60 chars), precise product name with key feature only.
- DESCRIPTION: Full paragraph (3-5 sentences) covering: condition, features, why to buy, any useful details.
- Never repeat the title content inside the description.
- Reply only in the required format, no extra text.`;

    const userPrompt = isAr
      ? isRequest
        ? `أعد صياغة طلب الشراء هذا بأسلوب واضح ومحترف:

العنوان الحالي: ${title || ''}
الوصف الحالي: ${description || ''}

أجب بهذا الشكل الحرفي فقط (سطرين فقط):
TITLE: [عنوان يبدأ بـ "أبحث عن" أو "مطلوب" - أقل من 60 حرف]
DESCRIPTION: [وصف 3-4 جمل يوضح المواصفات والميزانية وطلب التواصل]`
        : `أعد كتابة هذا الإعلان بأسلوب تسويقي احترافي:

العنوان الحالي: ${title || ''}
الوصف الحالي: ${description || ''}

أجب بهذا الشكل الحرفي فقط (سطرين فقط):
TITLE: [عنوان قصير - جملة واحدة أقل من 60 حرف]
DESCRIPTION: [وصف تفصيلي 3-5 جمل يشرح المنتج بالكامل]`
      : isRequest
        ? `Rewrite this buy request professionally:

Current title: ${title || ''}
Current description: ${description || ''}

Reply in this exact format only (two lines only):
TITLE: [title starting with "Looking for" or "Wanted:" - under 60 chars]
DESCRIPTION: [3-4 sentences covering specs, preferred condition, budget, and contact prompt]`
        : `Rewrite this listing professionally:

Current title: ${title || ''}
Current description: ${description || ''}

Reply in this exact format only (two lines only):
TITLE: [short title - one sentence under 60 chars]
DESCRIPTION: [detailed 3-5 sentence description explaining the product fully]`;

    const rawBaseUrl = Deno.env.get('ONSPACE_AI_BASE_URL') ?? 'https://ai.onspace.ai';
    const aiApiKey = Deno.env.get('ONSPACE_AI_API_KEY') ?? '';

    // Normalize base URL — strip trailing slash and any trailing /v1
    const aiBaseUrl = rawBaseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
    const endpoint = `${aiBaseUrl}/v1/chat/completions`;
    console.log('AI endpoint:', endpoint);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI API error:', response.status, errText, '| endpoint used:', endpoint);
      return new Response(
        JSON.stringify({ error: `AI error: ${response.status}`, detail: errText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';
    console.log('AI raw response:', content);

    // ── Robust line-by-line parser ──────────────────────────────────────────
    // Handles multiline descriptions and avoids regex greediness issues.
    let improvedTitle = title ?? '';
    let improvedDescription = description ?? '';

    const lines = content.split('\n');
    let inDesc = false;
    const descLines: string[] = [];

    for (const line of lines) {
      if (/^TITLE:\s*/i.test(line)) {
        improvedTitle = line.replace(/^TITLE:\s*/i, '').trim();
        inDesc = false;
      } else if (/^DESCRIPTION:\s*/i.test(line)) {
        inDesc = true;
        const firstPart = line.replace(/^DESCRIPTION:\s*/i, '').trim();
        if (firstPart) descLines.push(firstPart);
      } else if (inDesc) {
        const trimmed = line.trim();
        if (trimmed) descLines.push(trimmed);
      }
    }

    if (descLines.length > 0) {
      improvedDescription = descLines.join(' ');
    } else if (!improvedTitle && content.trim()) {
      // Fallback: use full content as description if parsing failed completely
      improvedDescription = content.trim();
    }

    console.log('Parsed title:', improvedTitle);
    console.log('Parsed description:', improvedDescription);

    return new Response(
      JSON.stringify({ title: improvedTitle, description: improvedDescription }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (e: any) {
    console.error('ai-copywrite error:', e);
    return new Response(
      JSON.stringify({ error: e.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
