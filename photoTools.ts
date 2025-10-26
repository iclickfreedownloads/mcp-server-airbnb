import { extractListingPhotos, formatPhotosForAnalysis } from './photoAnalyzer.js';

export const photoAnalysisTools = [
  {
    name: 'getListingPhotos',
    description: 'Extract photo URLs from an Airbnb listing',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Airbnb listing ID' },
        ignoreRobotsTxt: { type: 'boolean', description: 'Ignore robots.txt rules for this request' },
      },
      required: ['id'],
    },
  },
  {
    name: 'analyzeListingPhotos',
    description: 'Analyze photos from an Airbnb listing',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Airbnb listing ID' },
        ignoreRobotsTxt: { type: 'boolean', description: 'Ignore robots.txt rules for this request' },
      },
      required: ['id'],
    },
  },
];

export async function handlePhotoAnalysisTool(
  toolName: string,
  toolInput: any,
  isPathAllowed?: (path: string) => boolean,
  IGNORE_ROBOTS_TXT: boolean = false
) {
  try {
    const listingId = toolInput.id;
    const ignoreRobotsTxt = toolInput.ignoreRobotsTxt || false;

    if (!listingId) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Listing ID required' }) }],
        isError: true,
      };
    }

    const photos = await extractListingPhotos(listingId, isPathAllowed, ignoreRobotsTxt, IGNORE_ROBOTS_TXT);

    if (toolName === 'getListingPhotos') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: photos.extractionSuccess,
              photoCount: photos.photoCount,
              photoUrls: photos.photoUrls,
            }),
          },
        ],
        isError: !photos.extractionSuccess,
      };
    }

    if (toolName === 'analyzeListingPhotos') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: photos.extractionSuccess,
              photoCount: photos.photoCount,
              analysisPrompt: formatPhotosForAnalysis(photos),
              photoUrls: photos.photoUrls,
            }),
          },
        ],
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
