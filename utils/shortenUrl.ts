import { Platform } from 'react-native';

export async function shortenUrlWithCuttly(longUrl: string): Promise<string> {
  const API_KEY = '9c684b9c8532c8a2379ff1c5473df3180fe18';
  const encodedUrl = encodeURIComponent(longUrl);
  const endpoint = `https://cutt.ly/api/api.php?key=${API_KEY}&short=${encodedUrl}`;

  try {
    const response = await fetch(endpoint);
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

2. الحين وين ما بدك تشارك رابط خارجي (متجر، إعلان، منتج) استدعي الدالة بهالشكل:

import { shortenUrlWithCuttly } from '@/utils/shortenUrl';

// مثال عند الضغط على زر مشاركة
const handleShare = async () => {
  const originalLink = 'https://dmyjmmpytwppyfsjdmyj.backend.onspace.ai/store/123';
  const shortLink = await shortenUrlWithCuttly(originalLink);
  
  console.log('الرابط المختصر المباشر:', shortLink);
  // استخدم الـ shortLink في الواتساب أو دالة الـ Share مباشرة
};