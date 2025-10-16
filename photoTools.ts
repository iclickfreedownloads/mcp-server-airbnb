import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { extractListingPhotos, formatPhotosForAnalysis } from './photoAnalyzer.js';

export const photoAnalysisTools = [
  {
    name: 'getListingPhotos',
    description: 'Extract photo URLs from an Airbnb listing for visual analysis with Claude',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The Airbnb listing ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'analyzeListingPhotos',
    description: 'Extract and analyze photos from an Airbnb listing for space quality, design, and condition assessment',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The Airbnb listing ID',
        },
      },
      required: ['id'],
    },
  },
];

export async function handlePhotoAnalysisTool(toolName, toolInput) {
  try {
    const listingId = toolInput.id;
    if (!listingId) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Listing ID required', success: false }, null, 2),
          },
        ],
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
            }, null, 2),
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
              listingId: photos.listingId,
              photoCount: photos.photoCount,
              analysisPrompt: formatPhotosForAnalysis(photos),
              photoUrls: photos.photoUrls,
            }, null, 2),
          },
        ],
        isError: !photos.extractionSuccess,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: `Unknown tool: ${toolName}`, success: false }, null, 2),
        },
      ],
      isError: true,
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
            success: false,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
