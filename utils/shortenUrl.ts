import { Platform } from 'react-native';

export async function shortenUrl(longUrl: string): Promise<string> {
  try {
    const encodedUrl = encodeURIComponent(longUrl);
    // استخدام Is.gd لأنه أسرع ومجاني بالكامل
    const targetApi = `https://is.gd/create.php?format=simple&url=${encodedUrl}`;

    // حل مشكلة الحظر (CORS) على متصفح الويب باستخدام بروكسي
    // الجوال (iOS/Android) سيتصل بالرابط مباشرة بدون بروكسي
    const endpoint = Platform.OS === 'web' 
      ? `https://api.allorigins.win/raw?url=${encodeURIComponent(targetApi)}` 
      : targetApi;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const shortUrl = await response.text();
      // التأكد من أن النتيجة هي رابط فعلي وليست رسالة خطأ
      if (shortUrl.startsWith('http')) {
        return shortUrl.trim();
      }
    }
    
    return longUrl;
  } catch (error) {
    return longUrl;
  }
}