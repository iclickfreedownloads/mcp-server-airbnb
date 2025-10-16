import fetch from "node-fetch";
import * as cheerio from "cheerio";

export async function extractListingPhotos(listingId) {
  try {
    const url = `https://www.airbnb.com/rooms/${listingId}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    const photoUrls = [];

    $('img[src*="airbnb"]').each((_, el) => {
      const src = $(el).attr('src');
      const alt = $(el).attr('alt');
      if (src && alt?.includes('photo') && photoUrls.length < 50) {
        if (!photoUrls.includes(src)) photoUrls.push(src);
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
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}

export function formatPhotosForAnalysis(photos) {
  const photoList = photos.photoUrls.map((url, i) => `Photo ${i + 1}: ${url}`).join('\n');
  return `Listing ${photos.listingId}\n${photoList}`;
}
