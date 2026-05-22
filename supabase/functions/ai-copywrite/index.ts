import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, description, language } = await req.json();

    if (!title && !description) {
      return new Response(
        JSON.stringify({ error: 'Title or description required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isAr = language === 'ar';

    const systemPrompt = isAr
      ? `أنت خبير تسويق رقمي متخصص في سوق قلقيلية الفلسطيني. مهمتك إعادة صياغة إعلانات البيع بأسلوب تسويقي جذاب ومناسب للجمهور المحلي في قلقيلية وفلسطين.`
      : `You are a digital marketing expert specializing in Qalqilya's local marketplace. Your task is to rewrite product listings in an engaging, professional style suitable for the Palestinian local market.`;

    const userPrompt = isAr
      ? `بصفتك خبير تسويق رقمي لتطبيق سوق قلقيلية، قم بإعادة صياغة الإعلان التالي بأسلوب تسويقي جذاب، واضح، ومناسب للجمهور المحلي في قلقيلية وفلسطين، مع التركيز على نقاط البيع.

العنوان: ${title || ''}
الوصف: ${description || ''}

أعطني النتيجة بهذا الشكل بالضبط (بدون أي نص إضافي):
TITLE: [العنوان المُحسَّن]
DESCRIPTION: [الوصف المُحسَّن]`
      : `As a digital marketing expert for Souq Qalqilya app, rewrite the following listing in an engaging, clear, and compelling style for the local Palestinian market, focusing on selling points.

Title: ${title || ''}
Description: ${description || ''}

Give me the result in this exact format (no extra text):
TITLE: [improved title]
DESCRIPTION: [improved description]`;

    const rawBaseUrl = Deno.env.get('ONSPACE_AI_BASE_URL') ?? 'https://ai.onspace.ai';
    const aiApiKey = Deno.env.get('ONSPACE_AI_API_KEY') ?? '';

    // Normalize base URL — strip trailing slash and any trailing /v1
    // so we always construct the full path ourselves
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
        model: 'gemini-2.5-flash',
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
    const content = data.choices?.[0]?.message?.content ?? '';

    // Parse TITLE: and DESCRIPTION: from response
    const titleMatch = content.match(/TITLE:\s*(.+?)(?:\n|$)/i);
    const descMatch = content.match(/DESCRIPTION:\s*([\s\S]+?)(?:\n\n|$)/i);

    const improvedTitle = titleMatch?.[1]?.trim() ?? title;
    const improvedDescription = descMatch?.[1]?.trim() ?? content.trim();

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
