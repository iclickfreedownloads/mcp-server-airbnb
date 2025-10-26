import fetch from "node-fetch";
import * as cheerio from "cheerio";

export async function extractListingPhotos(
  listingId: string,
  isPathAllowed?: (path: string) => boolean,
  ignoreRobotsTxt: boolean = true,
  IGNORE_ROBOTS_TXT: boolean = false
) {
  try {
    const url = `https://www.airbnb.com/rooms/${listingId}`;
    const path = `/rooms/${listingId}`;

    // Check robots.txt if not ignored
    if (!ignoreRobotsTxt && !IGNORE_ROBOTS_TXT && isPathAllowed && !isPathAllowed(path)) {
      return {
        listingId,
        photoUrls: [],
        photoCount: 0,
        extractionSuccess: false,
        error: 'Path disallowed by robots.txt',
        timestamp: new Date().toISOString(),
      };
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    const photoUrls: string[] = [];

    try {
      // Extract photos from the JSON data in the page
      const scriptElement = $("#data-deferred-state-0").first();
      if (scriptElement.length > 0) {
        const scriptContent = $(scriptElement).text();
        if (scriptContent) {
          const jsonData = JSON.parse(scriptContent);

          // Navigate to the photos data in the JSON structure
          const clientData = jsonData?.niobeClientData?.[0]?.[1];
          const sections = clientData?.data?.presentation?.stayProductDetailPage?.sections?.sections;

          if (sections && Array.isArray(sections)) {
            // Look for HERO section which contains main photos
            const heroSection = sections.find((s: any) => s.sectionId === 'HERO_DEFAULT');
            if (heroSection?.section?.structuredDisplayData?.photoTiles) {
              heroSection.section.structuredDisplayData.photoTiles.forEach((tile: any) => {
                if (tile.picture?.pictureUrls?.[0]) {
                  const photoUrl = tile.picture.pictureUrls[0];
                  if (!photoUrls.includes(photoUrl)) {
                    photoUrls.push(photoUrl);
                  }
                }
              });
            }
          }

          // Also try to get photos from the mediaItems structure
          const mediaItems = clientData?.data?.presentation?.stayProductDetailPage?.sections?.metadata?.sharingConfig?.mediaItems;
          if (mediaItems && Array.isArray(mediaItems)) {
            mediaItems.forEach((item: any) => {
              if (item.baseUrl) {
                const photoUrl = item.baseUrl;
                if (!photoUrls.includes(photoUrl)) {
                  photoUrls.push(photoUrl);
                }
              }
            });
          }
        }
      }
    } catch (parseError) {
      // If JSON parsing fails, fall back to img tag scraping
      console.error('Failed to parse JSON data, falling back to img scraping:', parseError);
    }

    // Fallback: scrape img tags if no photos found in JSON
    if (photoUrls.length === 0) {
      $('img').each((_: any, el: any) => {
        const src = $(el).attr('src');
        if (src && src.includes('airbnb') && photoUrls.length < 50) {
          // Get high-quality version by removing size parameters
          const cleanUrl = src.split('?')[0];
          if (!photoUrls.includes(cleanUrl) && cleanUrl.match(/\.(jpg|jpeg|png|webp)/i)) {
            photoUrls.push(cleanUrl);
          }
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
      photoUrls: [],
      photoCount: 0,
      extractionSuccess: false,
      error: (error instanceof Error ? error.message : 'Unknown error'),
      timestamp: new Date().toISOString(),
    };
  }
}

export function formatPhotosForAnalysis(photos: any) {
  const photoList = photos.photoUrls.map((url: string, i: number) => `Photo ${i + 1}: ${url}`).join('\n');
  return `Listing ${photos.listingId}\n${photoList}`;
}
