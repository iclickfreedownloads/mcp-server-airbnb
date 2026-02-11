import fetch from "node-fetch";
import * as cheerio from "cheerio";

/**
 * Recursively search a data object for photo URLs matching Airbnb's CDN patterns.
 */
function extractPhotosFromData(data: any): string[] {
  const photos: string[] = [];

  function findPhotos(obj: any, depth: number = 0) {
    if (depth > 15 || photos.length >= 50) return;
    if (!obj || typeof obj !== 'object') return;

    if (typeof obj.baseUrl === 'string' && obj.baseUrl.includes('musaceae.com') || typeof obj.baseUrl === 'string' && obj.baseUrl.includes('muscache.com')) {
      if (!photos.includes(obj.baseUrl)) photos.push(obj.baseUrl);
    }
    if (typeof obj.url === 'string' && (obj.url.includes('muscache.com') || obj.url.includes('musaceae.com'))) {
      if (!photos.includes(obj.url)) photos.push(obj.url);
    }
    if (typeof obj.pictureUrl === 'string' && !photos.includes(obj.pictureUrl)) {
      photos.push(obj.pictureUrl);
    }
    if (typeof obj.picture_url === 'string' && !photos.includes(obj.picture_url)) {
      photos.push(obj.picture_url);
    }

    if (Array.isArray(obj)) {
      for (const item of obj) findPhotos(item, depth + 1);
    } else {
      for (const key of Object.keys(obj)) {
        findPhotos(obj[key], depth + 1);
      }
    }
  }

  findPhotos(data);
  return photos;
}

export async function extractListingPhotos(listingId: string) {
  try {
    const url = `https://www.airbnb.com/rooms/${listingId}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    let photoUrls: string[] = [];

    // Method 1: Extract from embedded JSON data (most reliable)
    try {
      const scriptElement = $('#data-deferred-state-0').first();
      if (scriptElement.length > 0) {
        const scriptContent = $(scriptElement).text();
        if (scriptContent) {
          const data = JSON.parse(scriptContent);
          photoUrls = extractPhotosFromData(data);
        }
      }
    } catch (_e) {
      // Fall through to HTML parsing methods
    }

    // Method 2: Fallback - look for images from Airbnb's CDN in HTML
    if (photoUrls.length === 0) {
      $('img').each((_: any, el: any) => {
        const src = $(el).attr('src');
        if (src && (src.includes('muscache.com') || src.includes('musaceae.com')) && photoUrls.length < 50) {
          if (!photoUrls.includes(src)) photoUrls.push(src);
        }
      });
    }

    // Method 3: Look for Open Graph image meta tags
    if (photoUrls.length === 0) {
      $('meta[property="og:image"]').each((_: any, el: any) => {
        const content = $(el).attr('content');
        if (content && !photoUrls.includes(content)) {
          photoUrls.push(content);
        }
      });
    }

    return {
      listingId,
      photoUrls,
      photoCount: photoUrls.length,
      extractionSuccess: photoUrls.length > 0,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      listingId,
      photoUrls: [] as string[],
      photoCount: 0,
      extractionSuccess: false,
      error: (error instanceof Error ? error.message : 'Unknown error'),
      timestamp: new Date().toISOString(),
    };
  }
}

export async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/jpeg,image/png,image/*',
      },
    });

    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';

    return { data: base64, mimeType };
  } catch (_e) {
    return null;
  }
}

export function formatPhotosForAnalysis(photos: { listingId: string; photoUrls: string[] }) {
  const photoList = photos.photoUrls.map((url: string, i: number) => `Photo ${i + 1}: ${url}`).join('\n');
  return `Listing ${photos.listingId}\n${photoList}`;
}
