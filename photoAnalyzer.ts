import axios from 'axios';
import * as cheerio from 'cheerio';

export interface PhotoData {
  url: string;
  alt?: string;
  caption?: string;
}

export interface ListingPhotos {
  listingId: string;
  title: string;
  photos: PhotoData[];
  photoCount: number;
}

export interface PhotoAnalysisResult {
  listingId: string;
  photoUrls: string[];
  photoCount: number;
  extractionSuccess: boolean;
  error?: string;
  timestamp: string;
}

/**
 * Extract all photo URLs from an Airbnb listing page
 * Returns photo URLs that can be fed to Claude for vision analysis
 */
export async function extractListingPhotos(listingId: string): Promise<PhotoAnalysisResult> {
  try {
    const url = `https://www.airbnb.com/rooms/${listingId}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const photoUrls: string[] = [];

    // Extract photos from common Airbnb image containers
    // These selectors may need updating if Airbnb changes their HTML structure
    $('img[src*="airbnb"]').each((index, element) => {
      const src = $(element).attr('src');
      const alt = $(element).attr('alt');
      
      // Filter for actual listing photos (exclude logos, avatars, etc.)
      if (
        src && 
        (alt?.toLowerCase().includes('photo') || 
         alt?.toLowerCase().includes('image') ||
         src.includes('/pictures/')) &&
        !photoUrls.includes(src) &&
        photoUrls.length < 50 // Limit to 50 photos
      ) {
        photoUrls.push(src);
      }
    });

    // Alternative method: Extract from structured data (JSON-LD)
    if (photoUrls.length === 0) {
      const scriptTags = $('script[type="application/ld+json"]');
      scriptTags.each((index, element) => {
        try {
          const data = JSON.parse($(element).html() || '{}');
          if (data.image && Array.isArray(data.image)) {
            data.image.forEach((img: string) => {
              if (!photoUrls.includes(img) && photoUrls.length < 50) {
                photoUrls.push(img);
              }
            });
          }
        } catch (e) {
          // Silently skip JSON parsing errors
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
    console.error(`Error extracting photos for listing ${listingId}:`, error);
    return {
      listingId,
      photoUrls: [],
      photoCount: 0,
      extractionSuccess: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Format photo URLs for Claude vision analysis
 * Returns a structured prompt that guides Claude's analysis
 */
export function formatPhotosForAnalysis(photos: PhotoAnalysisResult): string {
  if (!photos.extractionSuccess || photos.photoUrls.length === 0) {
    return `No photos could be extracted from listing ${photos.listingId}`;
  }

  const photoList = photos.photoUrls
    .map((url, index) => `Photo ${index + 1}: ${url}`)
    .join('\n');

  return `
Listing Photos Analysis Request
================================
Listing ID: ${photos.listingId}
Total Photos: ${photos.photoCount}

Here are the photos from this listing:
${photoList}

Please analyze these photos and provide:
1. Overall space quality assessment (cleanliness, condition, modernness)
2. Interior design style and aesthetic
3. Key amenities visible in photos
4. Lighting quality and natural light
5. Any red flags or concerns (damage, wear and tear, cleanliness issues)
6. Furniture condition and professionalism of staging
7. Photo quality assessment (professional vs amateur photography)
8. Overall recommendation score (1-10) based on visual inspection
9. Notable strengths and weaknesses
  `;
}

/**
 * Get photo URLs suitable for direct display in client
 * Converts URLs to formats that MCP clients can render
 */
export function formatPhotosForDisplay(photos: PhotoAnalysisResult): PhotoDisplayFormat {
  return {
    listingId: photos.listingId,
    totalPhotos: photos.photoCount,
    photos: photos.photoUrls.map((url, index) => ({
      index: index + 1,
      url: url,
      // Ensure URLs have proper protocol
      displayUrl: ensureHttpsUrl(url),
    })),
    extractedAt: photos.timestamp,
  };
}

/**
 * Ensure URL has https protocol for secure loading
 */
function ensureHttpsUrl(url: string): string {
  if (url.startsWith('http')) {
    return url.replace('http://', 'https://');
  }
  if (url.startsWith('//')) {
    return `https:${url}`;
  }
  if (url.startsWith('/')) {
    return `https://airbnb.com${url}`;
  }
  return url;
}

export interface PhotoDisplayFormat {
  listingId: string;
  totalPhotos: number;
  photos: Array<{
    index: number;
    url: string;
    displayUrl: string;
  }>;
  extractedAt: string;
}
