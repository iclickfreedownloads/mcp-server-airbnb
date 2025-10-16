import fetch from "node-fetch";
import * as cheerio from "cheerio";

export async function extractListingPhotos(listingId: string) {
  try {
    const url = `https://www.airbnb.com/rooms/${listingId}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const photoUrls = [];

    $('img[src*="airbnb"]').each((_index, element) => {
      const src = $(element).attr('src');
      const alt = $(element).attr('alt');
      
      if (src && (alt?.toLowerCase().includes('photo') || src.includes('/pictures/')) && !photoUrls.includes(src) && photoUrls.length < 50) {
        photoUrls.push(src);
      }
    });

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
      photoUrls: [],
      photoCount: 0,
      extractionSuccess: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}

export function formatPhotosForAnalysis(photos) {
  if (!photos.extractionSuccess || photos.photoUrls.length === 0) {
    return `No photos from listing ${photos.listingId}`;
  }

  const photoList = photos.photoUrls.map((url, i) => `Photo ${i + 1}: ${url}`).join('\n');

  return `Listing ${photos.listingId} - ${photos.photoCount} photos\n${photoList}\n\nAnalyze for: cleanliness, design, lighting, amenities, condition, professionalism, and overall quality (1-10).`;
}
