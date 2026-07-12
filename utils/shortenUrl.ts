/**
 * Shortens a URL using the free TinyURL API.
 * Falls back to the original URL if the request fails or times out.
 */
export async function shortenUrl(longUrl: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    const response = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!response.ok) return longUrl;
    const short = (await response.text()).trim();
    // Basic sanity check — TinyURL returns a URL string starting with https://
    if (short.startsWith('http')) return short;
    return longUrl;
  } catch {
    return longUrl;
  }
}
