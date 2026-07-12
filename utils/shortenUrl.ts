export async function shortenUrl(longUrl: string): Promise<string> {
  try {
    const encodedUrl = encodeURIComponent(longUrl);
    // استخدام Is.gd لاختصار الروابط بشكل مباشر ومجاني بالكامل
    const endpoint = `https://is.gd/create.php?format=simple&url=${encodedUrl}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const shortUrl = await response.text();
      // التأكد أن الرد عبارة عن رابط فعلي
      if (shortUrl.startsWith('http')) {
        return shortUrl.trim();
      }
    }
    
    return longUrl;
  } catch (error) {
    return longUrl;
  }
}