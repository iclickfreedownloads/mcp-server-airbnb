import { extractListingPhotos, fetchImageAsBase64, formatPhotosForAnalysis } from './photoAnalyzer.js';

export const photoAnalysisTools = [
  {
    name: 'getListingPhotos',
    description: 'Extract photo URLs from an Airbnb listing. Returns a list of photo URLs for the property.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Airbnb listing ID' },
      },
      required: ['id'],
    },
    annotations: {
      title: 'Get Listing Photos',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'analyzeListingPhotos',
    description: 'Retrieve and analyze photos from an Airbnb listing. Returns actual images for visual analysis of the property.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Airbnb listing ID' },
      },
      required: ['id'],
    },
    annotations: {
      title: 'Analyze Listing Photos',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];

const MAX_ANALYSIS_PHOTOS = 5;

export async function handlePhotoAnalysisTool(toolName: string, toolInput: any) {
  try {
    const listingId = toolInput.id;
    if (!listingId) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Listing ID required' }) }],
        isError: true,
      };
    }

    const photos = await extractListingPhotos(listingId);

    if (toolName === 'getListingPhotos') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: photos.extractionSuccess,
              listingId: photos.listingId,
              photoCount: photos.photoCount,
              photoUrls: photos.photoUrls,
            }),
          },
        ],
        isError: !photos.extractionSuccess,
      };
    }

    if (toolName === 'analyzeListingPhotos') {
      const content: any[] = [];

      if (photos.extractionSuccess) {
        // Fetch actual images for visual analysis (up to MAX_ANALYSIS_PHOTOS)
        const photosToAnalyze = photos.photoUrls.slice(0, MAX_ANALYSIS_PHOTOS);
        const imageResults = await Promise.allSettled(
          photosToAnalyze.map(url => fetchImageAsBase64(url))
        );

        for (const result of imageResults) {
          if (result.status === 'fulfilled' && result.value) {
            content.push({
              type: 'image',
              data: result.value.data,
              mimeType: result.value.mimeType,
            });
          }
        }
      }

      // Always include a text summary with all photo URLs
      const analyzedCount = content.filter(c => c.type === 'image').length;
      content.push({
        type: 'text',
        text: JSON.stringify({
          success: photos.extractionSuccess,
          listingId: photos.listingId,
          totalPhotos: photos.photoCount,
          analyzedPhotos: analyzedCount,
          allPhotoUrls: photos.photoUrls,
          analysisPrompt: photos.extractionSuccess
            ? formatPhotosForAnalysis(photos)
            : 'No photos could be extracted for analysis.',
        }),
      });

      return {
        content,
        isError: !photos.extractionSuccess,
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Unknown tool' }) }],
      isError: true,
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: (error instanceof Error ? error.message : 'Unknown error') }) }],
      isError: true,
    };
  }
}
