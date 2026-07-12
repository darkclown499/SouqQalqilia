import { Platform } from 'react-native';

export async function shortenUrl(longUrl: string): Promise<string> {
  const API_KEY = '9c684b9c8532c8a2379ff1c5473df3180fe18';
  const encodedUrl = encodeURIComponent(longUrl);
  const targetApi = `https://cutt.ly/api/api.php?key=${API_KEY}&short=${encodedUrl}`;

  // استخدام بروكسي لتجاوز حظر CORS على متصفح الويب، والاتصال المباشر على الجوال
  const endpoint = Platform.OS === 'web' 
    ? `https://api.allorigins.win/raw?url=${encodeURIComponent(targetApi)}` 
    : targetApi;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeout);
    
    const data = await response.json();

    // حالة 7 تعني نجاح الاختصار في Cuttly
    if (data.url && data.url.status === 7) {
      return data.url.shortLink;
    }
    
    return longUrl; 
  } catch (error) {
    return longUrl; 
  }
}