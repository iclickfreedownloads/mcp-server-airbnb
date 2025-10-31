#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { cleanObject, flattenArraysInObject, pickBySchema } from "./util.js";
import robotsParser from "robots-parser";
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion() {
  try {
    const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
    return process.env.MCP_SERVER_VERSION || packageJson.version || "unknown";
  } catch (error) {
    return process.env.MCP_SERVER_VERSION || "unknown";
  }
}

const VERSION = getVersion();

const AIRBNB_SEARCH_TOOL = {
  name: "airbnb_search",
  description: "Search for Airbnb listings with various filters and pagination. Provide direct links to the user",
  inputSchema: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "Location to search for (city, state, etc.)"
      },
      placeId: {
        type: "string",
        description: "Google Maps Place ID (overrides the location parameter)"
      },
      checkin: {
        type: "string",
        description: "Check-in date (YYYY-MM-DD)"
      },
      checkout: {
        type: "string",
        description: "Check-out date (YYYY-MM-DD)"
      },
      adults: {
        type: "number",
        description: "Number of adults"
      },
      children: {
        type: "number",
        description: "Number of children"
      },
      infants: {
        type: "number",
        description: "Number of infants"
      },
      pets: {
        type: "number",
        description: "Number of pets"
      },
      minPrice: {
        type: "number",
        description: "Minimum price for the stay"
      },
      maxPrice: {
        type: "number",
        description: "Maximum price for the stay"
      },
      cursor: {
        type: "string",
        description: "Base64-encoded string used for Pagination"
      },
      ignoreRobotsText: {
        type: "boolean",
        description: "Ignore robots.txt rules for this request"
      }
    },
    required: ["location"]
  }
};

const AIRBNB_LISTING_DETAILS_TOOL = {
  name: "airbnb_listing_details",
  description: "Get detailed information about a specific Airbnb listing. Provide direct links to the user",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The Airbnb listing ID"
      },
      checkin: {
        type: "string",
        description: "Check-in date (YYYY-MM-DD)"
      },
      checkout: {
        type: "string",
        description: "Check-out date (YYYY-MM-DD)"
      },
      adults: {
        type: "number",
        description: "Number of adults"
      },
      children: {
        type: "number",
        description: "Number of children"
      },
      infants: {
        type: "number",
        description: "Number of infants"
      },
      pets: {
        type: "number",
        description: "Number of pets"
      },
      ignoreRobotsText: {
        type: "boolean",
        description: "Ignore robots.txt rules for this request"
      }
    },
    required: ["id"]
  }
};

const AIRBNB_PRICE_COMPARISON_TOOL = {
  name: "airbnb_compare_prices",
  description: "Compare prices for a listing across multiple date ranges to find the best booking dates",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The Airbnb listing ID"
      },
      dateRanges: {
        type: "array",
        description: "Array of date ranges to compare, each with checkin and checkout dates",
        items: {
          type: "object",
          properties: {
            checkin: {
              type: "string",
              description: "Check-in date (YYYY-MM-DD)"
            },
            checkout: {
              type: "string",
              description: "Check-out date (YYYY-MM-DD)"
            }
          },
          required: ["checkin", "checkout"]
        }
      },
      adults: {
        type: "number",
        description: "Number of adults"
      },
      children: {
        type: "number",
        description: "Number of children"
      },
      infants: {
        type: "number",
        description: "Number of infants"
      },
      pets: {
        type: "number",
        description: "Number of pets"
      },
      ignoreRobotsText: {
        type: "boolean",
        description: "Ignore robots.txt rules for this request"
      }
    },
    required: ["id", "dateRanges"]
  }
};

const AIRBNB_REVIEWS_TOOL = {
  name: "airbnb_get_reviews",
  description: "Extract reviews and ratings from an Airbnb listing",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The Airbnb listing ID"
      },
      ignoreRobotsText: {
        type: "boolean",
        description: "Ignore robots.txt rules for this request"
      }
    },
    required: ["id"]
  }
};

const AIRBNB_COST_BREAKDOWN_TOOL = {
  name: "airbnb_cost_breakdown",
  description: "Get detailed cost breakdown including all fees for a booking",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The Airbnb listing ID"
      },
      checkin: {
        type: "string",
        description: "Check-in date (YYYY-MM-DD)"
      },
      checkout: {
        type: "string",
        description: "Check-out date (YYYY-MM-DD)"
      },
      adults: {
        type: "number",
        description: "Number of adults"
      },
      children: {
        type: "number",
        description: "Number of children"
      },
      infants: {
        type: "number",
        description: "Number of infants"
      },
      pets: {
        type: "number",
        description: "Number of pets"
      },
      ignoreRobotsText: {
        type: "boolean",
        description: "Ignore robots.txt rules for this request"
      }
    },
    required: ["id", "checkin", "checkout"]
  }
};

const AIRBNB_TOOLS = [
  AIRBNB_SEARCH_TOOL,
  AIRBNB_LISTING_DETAILS_TOOL,
  AIRBNB_PRICE_COMPARISON_TOOL,
  AIRBNB_REVIEWS_TOOL,
  AIRBNB_COST_BREAKDOWN_TOOL,
];

const USER_AGENT = "ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)";
const BASE_URL = "https://www.airbnb.com";
const IGNORE_ROBOTS_TXT = process.env.IGNORE_ROBOTS_TXT === "true" || process.argv.slice(2).includes("--ignore-robots-txt");

const robotsErrorMessage = "This path is disallowed by Airbnb's robots.txt to this User-agent. You may or may not want to run the server with '--ignore-robots-txt' args"
let robotsTxtContent = "";

async function fetchRobotsTxt() {
  if (IGNORE_ROBOTS_TXT) {
    log('info', 'Skipping robots.txt fetch (ignored by configuration)');
    return;
  }

  try {
    log('info', 'Fetching robots.txt from Airbnb');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`${BASE_URL}/robots.txt`, {
      headers: {
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    robotsTxtContent = await response.text();
    log('info', 'Successfully fetched robots.txt');
  } catch (error) {
    log('warn', 'Error fetching robots.txt, assuming all paths allowed', {
      error: error instanceof Error ? error.message : String(error)
    });
    robotsTxtContent = "";
  }
}

function isPathAllowed(path: string): boolean {
  if (!robotsTxtContent) {
    return true;
  }

  try {
    const robots = robotsParser(`${BASE_URL}/robots.txt`, robotsTxtContent);
    const allowed = robots.isAllowed(path, USER_AGENT);

    if (!allowed) {
      log('warn', 'Path disallowed by robots.txt', { path, userAgent: USER_AGENT });
    }

    return allowed;
  } catch (error) {
    log('warn', 'Error parsing robots.txt, allowing path', {
      path,
      error: error instanceof Error ? error.message : String(error)
    });
    return true;
  }
}

async function fetchWithUserAgent(url: string, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }

    throw error;
  }
}

async function handleAirbnbSearch(params: any) {
  const {
    location,
    placeId,
    checkin,
    checkout,
    adults = 1,
    children = 0,
    infants = 0,
    pets = 0,
    minPrice,
    maxPrice,
    cursor,
    ignoreRobotsText = false,
  } = params;

  const searchUrl = new URL(`${BASE_URL}/s/${encodeURIComponent(location)}/homes`);
  
  if (placeId) searchUrl.searchParams.append("place_id", placeId);
  if (checkin) searchUrl.searchParams.append("checkin", checkin);
  if (checkout) searchUrl.searchParams.append("checkout", checkout);
  
  const adults_int = parseInt(adults.toString());
  const children_int = parseInt(children.toString());
  const infants_int = parseInt(infants.toString());
  const pets_int = parseInt(pets.toString());
  
  const totalGuests = adults_int + children_int;
  if (totalGuests > 0) {
    searchUrl.searchParams.append("adults", adults_int.toString());
    searchUrl.searchParams.append("children", children_int.toString());
    searchUrl.searchParams.append("infants", infants_int.toString());
    searchUrl.searchParams.append("pets", pets_int.toString());
  }
  
  if (minPrice) searchUrl.searchParams.append("price_min", minPrice.toString());
  if (maxPrice) searchUrl.searchParams.append("price_max", maxPrice.toString());
  if (cursor) {
    searchUrl.searchParams.append("cursor", cursor);
  }

  const path = searchUrl.pathname + searchUrl.search;
  if (!ignoreRobotsText && !isPathAllowed(path)) {
    log('warn', 'Search blocked by robots.txt', { path, url: searchUrl.toString() });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: robotsErrorMessage,
          url: searchUrl.toString(),
          suggestion: "Consider enabling 'ignore_robots_txt' in extension settings if needed for testing"
        }, null, 2)
      }],
      isError: true
    };
  }

  const allowSearchResultSchema = {
    demandStayListing : {
      id: true,
      description: true,
      location: true,
    },
    badges: {
      text: true,
    },
    structuredContent: {
      mapCategoryInfo: {
        body: true
      },
      mapSecondaryLine: {
        body: true
      },
      primaryLine: {
        body: true
      },
      secondaryLine: {
        body: true
      },
    },
    avgRatingA11yLabel: true,
    listingParamOverrides: true,
    structuredDisplayPrice: {
      primaryLine: {
        accessibilityLabel: true,
      },
      secondaryLine: {
        accessibilityLabel: true,
      },
      explanationData: {
        title: true,
        priceDetails: {
          items: {
            description: true,
            priceString: true
          }
        }
      }
    },
  };

  try {
    log('info', 'Performing Airbnb search', { location, checkin, checkout, adults, children });

    const response = await fetchWithUserAgent(searchUrl.toString());
    const html = await response.text();
    const $ = cheerio.load(html);

    let staysSearchResults: any = {};
    
    try {
      const scriptElement = $("#data-deferred-state-0").first();
      if (scriptElement.length === 0) {
        throw new Error("Could not find data script element - page structure may have changed");
      }
      
      const scriptContent = $(scriptElement).text();
      if (!scriptContent) {
        throw new Error("Data script element is empty");
      }
      
      const clientData = JSON.parse(scriptContent).niobeClientData[0][1];
      const results = clientData.data.presentation.staysSearch.results;
      cleanObject(results);
      
      staysSearchResults = {
        searchResults: results.searchResults
          .map((result: any) => flattenArraysInObject(pickBySchema(result, allowSearchResultSchema)))
          .map((result: any) => {
            const id = atob(result.demandStayListing.id).split(":")[1];
            return {id, url: `${BASE_URL}/rooms/${id}`, ...result }
          }),
        paginationInfo: results.paginationInfo
      }
      
      log('info', 'Search completed successfully', { 
        resultCount: staysSearchResults.searchResults?.length || 0 
      });
    } catch (parseError) {
      log('error', 'Failed to parse search results', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        url: searchUrl.toString()
      });
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Failed to parse search results from Airbnb. The page structure may have changed.",
            details: parseError instanceof Error ? parseError.message : String(parseError),
            searchUrl: searchUrl.toString()
          }, null, 2)
        }],
        isError: true
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          searchUrl: searchUrl.toString(),
          ...staysSearchResults
        }, null, 2)
      }],
      isError: false
    };
  } catch (error) {
    log('error', 'Search request failed', {
      error: error instanceof Error ? error.message : String(error),
      url: searchUrl.toString()
    });
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          searchUrl: searchUrl.toString(),
          timestamp: new Date().toISOString()
        }, null, 2)
      }],
      isError: true
    };
  }
}

async function handleAirbnbListingDetails(params: any) {
  const {
    id,
    checkin,
    checkout,
    adults = 1,
    children = 0,
    infants = 0,
    pets = 0,
    ignoreRobotsText = false,
  } = params;

  const listingUrl = new URL(`${BASE_URL}/rooms/${id}`);
  
  if (checkin) listingUrl.searchParams.append("check_in", checkin);
  if (checkout) listingUrl.searchParams.append("check_out", checkout);
  
  const adults_int = parseInt(adults.toString());
  const children_int = parseInt(children.toString());
  const infants_int = parseInt(infants.toString());
  const pets_int = parseInt(pets.toString());
  
  const totalGuests = adults_int + children_int;
  if (totalGuests > 0) {
    listingUrl.searchParams.append("adults", adults_int.toString());
    listingUrl.searchParams.append("children", children_int.toString());
    listingUrl.searchParams.append("infants", infants_int.toString());
    listingUrl.searchParams.append("pets", pets_int.toString());
  }

  const path = listingUrl.pathname + listingUrl.search;
  if (!ignoreRobotsText && !isPathAllowed(path)) {
    log('warn', 'Listing details blocked by robots.txt', { path, url: listingUrl.toString() });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: robotsErrorMessage,
          url: listingUrl.toString(),
          suggestion: "Consider enabling 'ignore_robots_txt' in extension settings if needed for testing"
        }, null, 2)
      }],
      isError: true
    };
  }

  const allowSectionSchema = {
    "LOCATION_DEFAULT": {
      lat: true,
      lng: true,
      subtitle: true,
      title: true
    },
    "POLICIES_DEFAULT": {
      title: true,
      houseRulesSections: {
        title: true,
        items : {
          title: true
        }
      }
    },
    "HIGHLIGHTS_DEFAULT": {
      highlights: {
        title: true
      }
    },
    "DESCRIPTION_DEFAULT": {
      htmlDescription: {
        htmlText: true
      }
    },
    "AMENITIES_DEFAULT": {
      title: true,
      seeAllAmenitiesGroups: {
        title: true,
        amenities: {
          title: true
        }
      }
    },
  };

  try {
    log('info', 'Fetching listing details', { id, checkin, checkout, adults, children });
    
    const response = await fetchWithUserAgent(listingUrl.toString());
    const html = await response.text();
    const $ = cheerio.load(html);
    
    let details = {};
    
    try {
      const scriptElement = $("#data-deferred-state-0").first();
      if (scriptElement.length === 0) {
        throw new Error("Could not find data script element - page structure may have changed");
      }
      
      const scriptContent = $(scriptElement).text();
      if (!scriptContent) {
        throw new Error("Data script element is empty");
      }
      
      const clientData = JSON.parse(scriptContent).niobeClientData[0][1];
      const sections = clientData.data.presentation.stayProductDetailPage.sections.sections;
      sections.forEach((section: any) => cleanObject(section));

      details = sections
        .filter((section: any) => allowSectionSchema.hasOwnProperty(section.sectionId))
        .map((section: any) => {
          return {
            id: section.sectionId,
            ...flattenArraysInObject(pickBySchema(section.section, allowSectionSchema[section.sectionId as keyof typeof allowSectionSchema]))
          }
        });
        
      log('info', 'Listing details fetched successfully', { 
        id, 
        sectionsFound: Array.isArray(details) ? details.length : 0 
      });
    } catch (parseError) {
      log('error', 'Failed to parse listing details', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        id,
        url: listingUrl.toString()
      });
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Failed to parse listing details from Airbnb. The page structure may have changed.",
            details: parseError instanceof Error ? parseError.message : String(parseError),
            listingUrl: listingUrl.toString()
          }, null, 2)
        }],
        isError: true
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          listingUrl: listingUrl.toString(),
          details: details
        }, null, 2)
      }],
      isError: false
    };
  } catch (error) {
    log('error', 'Listing details request failed', {
      error: error instanceof Error ? error.message : String(error),
      id,
      url: listingUrl.toString()
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          listingUrl: listingUrl.toString(),
          timestamp: new Date().toISOString()
        }, null, 2)
      }],
      isError: true
    };
  }
}

async function handlePriceComparison(params: any) {
  const {
    id,
    dateRanges,
    adults = 1,
    children = 0,
    infants = 0,
    pets = 0,
    ignoreRobotsText = false,
  } = params;

  if (!Array.isArray(dateRanges) || dateRanges.length === 0) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "dateRanges must be a non-empty array"
        }, null, 2)
      }],
      isError: true
    };
  }

  try {
    log('info', 'Comparing prices across date ranges', { id, rangeCount: dateRanges.length });

    const priceComparisons = [];

    for (const range of dateRanges) {
      const listingUrl = new URL(`${BASE_URL}/rooms/${id}`);

      if (range.checkin) listingUrl.searchParams.append("check_in", range.checkin);
      if (range.checkout) listingUrl.searchParams.append("check_out", range.checkout);

      const adults_int = parseInt(adults.toString());
      const children_int = parseInt(children.toString());
      const infants_int = parseInt(infants.toString());
      const pets_int = parseInt(pets.toString());

      const totalGuests = adults_int + children_int;
      if (totalGuests > 0) {
        listingUrl.searchParams.append("adults", adults_int.toString());
        listingUrl.searchParams.append("children", children_int.toString());
        listingUrl.searchParams.append("infants", infants_int.toString());
        listingUrl.searchParams.append("pets", pets_int.toString());
      }

      const path = listingUrl.pathname + listingUrl.search;
      if (!ignoreRobotsText && !isPathAllowed(path)) {
        priceComparisons.push({
          checkin: range.checkin,
          checkout: range.checkout,
          error: robotsErrorMessage,
          url: listingUrl.toString()
        });
        continue;
      }

      try {
        const response = await fetchWithUserAgent(listingUrl.toString());
        const html = await response.text();
        const $ = cheerio.load(html);

        const scriptElement = $("#data-deferred-state-0").first();
        if (scriptElement.length === 0) {
          throw new Error("Could not find data script element");
        }

        const scriptContent = $(scriptElement).text();
        if (!scriptContent) {
          throw new Error("Data script element is empty");
        }

        const clientData = JSON.parse(scriptContent).niobeClientData[0][1];
        const sections = clientData.data.presentation.stayProductDetailPage.sections.sections;

        // Extract price information
        let priceInfo: any = {
          checkin: range.checkin,
          checkout: range.checkout,
          url: listingUrl.toString()
        };

        // Try to find pricing section
        for (const section of sections) {
          if (section.section && section.section.structuredDisplayPrice) {
            const pricing = section.section.structuredDisplayPrice;
            if (pricing.primaryLine) {
              priceInfo.displayPrice = pricing.primaryLine.accessibilityLabel || pricing.primaryLine.price;
            }
            if (pricing.secondaryLine) {
              priceInfo.priceDetails = pricing.secondaryLine.accessibilityLabel;
            }
            if (pricing.explanationData) {
              priceInfo.breakdown = pricing.explanationData;
            }
          }
        }

        priceComparisons.push(priceInfo);
      } catch (parseError) {
        priceComparisons.push({
          checkin: range.checkin,
          checkout: range.checkout,
          error: parseError instanceof Error ? parseError.message : String(parseError),
          url: listingUrl.toString()
        });
      }
    }

    log('info', 'Price comparison completed', {
      id,
      successfulComparisons: priceComparisons.filter(c => !c.error).length
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          listingId: id,
          comparisons: priceComparisons
        }, null, 2)
      }],
      isError: false
    };
  } catch (error) {
    log('error', 'Price comparison failed', {
      error: error instanceof Error ? error.message : String(error),
      id
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          listingId: id,
          timestamp: new Date().toISOString()
        }, null, 2)
      }],
      isError: true
    };
  }
}

async function handleReviews(params: any) {
  const {
    id,
    ignoreRobotsText = false,
  } = params;

  const listingUrl = new URL(`${BASE_URL}/rooms/${id}`);

  const path = listingUrl.pathname + listingUrl.search;
  if (!ignoreRobotsText && !isPathAllowed(path)) {
    log('warn', 'Reviews blocked by robots.txt', { path, url: listingUrl.toString() });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: robotsErrorMessage,
          url: listingUrl.toString(),
          suggestion: "Consider enabling 'ignore_robots_txt' in extension settings if needed for testing"
        }, null, 2)
      }],
      isError: true
    };
  }

  try {
    log('info', 'Fetching reviews', { id });

    const response = await fetchWithUserAgent(listingUrl.toString());
    const html = await response.text();
    const $ = cheerio.load(html);

    let reviewsData: any = {
      listingId: id,
      url: listingUrl.toString()
    };

    try {
      const scriptElement = $("#data-deferred-state-0").first();
      if (scriptElement.length === 0) {
        throw new Error("Could not find data script element");
      }

      const scriptContent = $(scriptElement).text();
      if (!scriptContent) {
        throw new Error("Data script element is empty");
      }

      const clientData = JSON.parse(scriptContent).niobeClientData[0][1];
      const sections = clientData.data.presentation.stayProductDetailPage.sections.sections;

      // Extract review information
      for (const section of sections) {
        if (section.sectionId === "REVIEWS_DEFAULT" && section.section) {
          reviewsData.reviewsSection = {
            title: section.section.title,
            reviews: section.section.reviews || []
          };
        }

        // Look for overall rating
        if (section.section && section.section.reviewDetailsModal) {
          reviewsData.overallRating = section.section.reviewDetailsModal;
        }
      }

      log('info', 'Reviews fetched successfully', {
        id,
        reviewCount: reviewsData.reviewsSection?.reviews?.length || 0
      });
    } catch (parseError) {
      log('error', 'Failed to parse reviews', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        id
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Failed to parse reviews from Airbnb. The page structure may have changed.",
            details: parseError instanceof Error ? parseError.message : String(parseError),
            listingUrl: listingUrl.toString()
          }, null, 2)
        }],
        isError: true
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(reviewsData, null, 2)
      }],
      isError: false
    };
  } catch (error) {
    log('error', 'Reviews request failed', {
      error: error instanceof Error ? error.message : String(error),
      id
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          listingUrl: listingUrl.toString(),
          timestamp: new Date().toISOString()
        }, null, 2)
      }],
      isError: true
    };
  }
}

async function handleCostBreakdown(params: any) {
  const {
    id,
    checkin,
    checkout,
    adults = 1,
    children = 0,
    infants = 0,
    pets = 0,
    ignoreRobotsText = false,
  } = params;

  const listingUrl = new URL(`${BASE_URL}/rooms/${id}`);

  if (checkin) listingUrl.searchParams.append("check_in", checkin);
  if (checkout) listingUrl.searchParams.append("check_out", checkout);

  const adults_int = parseInt(adults.toString());
  const children_int = parseInt(children.toString());
  const infants_int = parseInt(infants.toString());
  const pets_int = parseInt(pets.toString());

  const totalGuests = adults_int + children_int;
  if (totalGuests > 0) {
    listingUrl.searchParams.append("adults", adults_int.toString());
    listingUrl.searchParams.append("children", children_int.toString());
    listingUrl.searchParams.append("infants", infants_int.toString());
    listingUrl.searchParams.append("pets", pets_int.toString());
  }

  const path = listingUrl.pathname + listingUrl.search;
  if (!ignoreRobotsText && !isPathAllowed(path)) {
    log('warn', 'Cost breakdown blocked by robots.txt', { path, url: listingUrl.toString() });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: robotsErrorMessage,
          url: listingUrl.toString(),
          suggestion: "Consider enabling 'ignore_robots_txt' in extension settings if needed for testing"
        }, null, 2)
      }],
      isError: true
    };
  }

  try {
    log('info', 'Fetching cost breakdown', { id, checkin, checkout });

    const response = await fetchWithUserAgent(listingUrl.toString());
    const html = await response.text();
    const $ = cheerio.load(html);

    let costData: any = {
      listingId: id,
      checkin,
      checkout,
      url: listingUrl.toString()
    };

    try {
      const scriptElement = $("#data-deferred-state-0").first();
      if (scriptElement.length === 0) {
        throw new Error("Could not find data script element");
      }

      const scriptContent = $(scriptElement).text();
      if (!scriptContent) {
        throw new Error("Data script element is empty");
      }

      const clientData = JSON.parse(scriptContent).niobeClientData[0][1];
      const sections = clientData.data.presentation.stayProductDetailPage.sections.sections;

      // Extract pricing and cost information
      for (const section of sections) {
        if (section.section && section.section.structuredDisplayPrice) {
          const pricing = section.section.structuredDisplayPrice;

          costData.displayPrice = pricing.primaryLine?.accessibilityLabel || pricing.primaryLine?.price;
          costData.priceDetails = pricing.secondaryLine?.accessibilityLabel;

          if (pricing.explanationData) {
            costData.breakdown = {
              title: pricing.explanationData.title,
              items: pricing.explanationData.priceDetails?.items || []
            };
          }
        }
      }

      log('info', 'Cost breakdown fetched successfully', { id });
    } catch (parseError) {
      log('error', 'Failed to parse cost breakdown', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        id
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Failed to parse cost breakdown from Airbnb. The page structure may have changed.",
            details: parseError instanceof Error ? parseError.message : String(parseError),
            listingUrl: listingUrl.toString()
          }, null, 2)
        }],
        isError: true
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(costData, null, 2)
      }],
      isError: false
    };
  } catch (error) {
    log('error', 'Cost breakdown request failed', {
      error: error instanceof Error ? error.message : String(error),
      id
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          listingUrl: listingUrl.toString(),
          timestamp: new Date().toISOString()
        }, null, 2)
      }],
      isError: true
    };
  }
}

const server = new Server(
  {
    name: "airbnb",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

function log(level: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  if (data) {
    console.error(`${logMessage}:`, JSON.stringify(data, null, 2));
  } else {
    console.error(logMessage);
  }
}

log('info', 'Airbnb MCP Server starting', {
  version: VERSION,
  ignoreRobotsTxt: IGNORE_ROBOTS_TXT,
  nodeVersion: process.version,
  platform: process.platform
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: AIRBNB_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const startTime = Date.now();

  try {
    if (!request.params.name) {
      throw new McpError(ErrorCode.InvalidParams, "Tool name is required");
    }

    if (!request.params.arguments) {
      throw new McpError(ErrorCode.InvalidParams, "Tool arguments are required");
    }

    log('info', 'Tool call received', {
      tool: request.params.name,
      arguments: request.params.arguments
    });
    
    if (!robotsTxtContent && !IGNORE_ROBOTS_TXT) {
      await fetchRobotsTxt();
    }

    let result;
    switch (request.params.name) {
      case "airbnb_search": {
        result = await handleAirbnbSearch(request.params.arguments);
        break;
      }

      case "airbnb_listing_details": {
        result = await handleAirbnbListingDetails(request.params.arguments);
        break;
      }

      case "airbnb_compare_prices": {
        result = await handlePriceComparison(request.params.arguments);
        break;
      }

      case "airbnb_get_reviews": {
        result = await handleReviews(request.params.arguments);
        break;
      }

      case "airbnb_cost_breakdown": {
        result = await handleCostBreakdown(request.params.arguments);
        break;
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
    }
    
    const duration = Date.now() - startTime;
    log('info', 'Tool call completed', { 
      tool: request.params.name, 
      duration: `${duration}ms`,
      success: !result.isError 
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    log('error', 'Tool call failed', {
      tool: request.params.name,
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : String(error)
    });
    
    if (error instanceof McpError) {
      throw error;
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        }, null, 2)
      }],
      isError: true
    };
  }
});

async function runServer() {
  try {
    await fetchRobotsTxt();
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    log('info', 'Airbnb MCP Server running on stdio', {
      version: VERSION,
      robotsRespected: !IGNORE_ROBOTS_TXT
    });
    
    process.on('SIGINT', () => {
      log('info', 'Received SIGINT, shutting down gracefully');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      log('info', 'Received SIGTERM, shutting down gracefully');
      process.exit(0);
    });
    
  } catch (error) {
    log('error', 'Failed to start server', {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  }
}

runServer().catch((error) => {
  log('error', 'Fatal error running server', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
