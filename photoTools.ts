import { Tool } from '@modelcontextprotocol/sdk/types';
import {
  extractListingPhotos,
  formatPhotosForAnalysis,
  formatPhotosForDisplay,
} from './photoAnalyzer';

/**
 * Define the photo analysis tools for the MCP server
 * These will be available to Claude and other clients
 */
export const photoAnalysisTools: Tool[] = [
  {
    name: 'getListingPhotos',
    description:
      'Extract all photo URLs from an Airbnb listing. Returns photo URLs that can be analyzed by Claude vision capabilities. Perfect for inspecting property conditions, design, amenities, and quality.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The Airbnb listing ID (numeric ID from the URL)',
        },
        analyzeWithVision: {
          type: 'boolean',
          description:
            'If true, returns analysis-ready format for Claude vision. If false, returns raw photo URLs for display. Default: true',
          default: true,
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'analyzeListingPhotos',
    description:
      'Extract and prepare photos from a listing for Claude vision analysis. Returns photos formatted with guidance for comprehensive visual assessment including space quality, cleanliness, design, and potential red flags.',
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

/**
 * Handle tool calls for photo analysis
 */
export async function handlePhotoAnalysisTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string> {
  try {
    if (toolName === 'getListingPhotos') {
      const listingId = toolInput.id as string;
      const analyzeWithVision = (toolInput.analyzeWithVision as boolean) ?? true;

      if (!listingId) {
        return JSON.stringify({
          error: 'Listing ID is required',
          success: false,
        });
      }

      const photos = await extractListingPhotos(listingId);

      if (analyzeWithVision) {
        // Return analysis-ready format with guidance
        const analysisPrompt = formatPhotosForAnalysis(photos);
        return JSON.stringify({
          success: photos.extractionSuccess,
          listingId: photos.listingId,
          photoCount: photos.photoCount,
          analysisPrompt,
          photoUrls: photos.photoUrls,
          extractedAt: photos.timestamp,
        });
      } else {
        // Return display-ready format
        const displayFormat = formatPhotosForDisplay(photos);
        return JSON.stringify({
          success: photos.extractionSuccess,
          ...displayFormat,
        });
      }
    }

    if (toolName === 'analyzeListingPhotos') {
      const listingId = toolInput.id as string;

      if (!listingId) {
        return JSON.stringify({
          error: 'Listing ID is required',
          success: false,
        });
      }

      const photos = await extractListingPhotos(listingId);
      const analysisPrompt = formatPhotosForAnalysis(photos);

      return JSON.stringify({
        success: photos.extractionSuccess,
        listingId: photos.listingId,
        photoCount: photos.photoCount,
        message: 'Photos extracted and ready for analysis. Use the URLs below to analyze the listing visually.',
        analysisPrompt,
        photoUrls: photos.photoUrls,
        instructions:
          'Claude will now analyze these photos for you. You can ask for specific insights like cleanliness, design, condition, amenities, lighting, and overall quality assessment.',
        extractedAt: photos.timestamp,
      });
    }

    return JSON.stringify({
      error: `Unknown tool: ${toolName}`,
      success: false,
    });
  } catch (error) {
    console.error(`Error handling photo analysis tool ${toolName}:`, error);
    return JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
      toolName,
    });
  }
}
