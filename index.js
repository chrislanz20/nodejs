const express = require('express');
const path = require('path');
const { Client } = require('@googlemaps/google-maps-services-js');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Google APIs
const placesClient = new Client({});
const axios = require('axios');

// Initialize Google Sheets client
let sheetsClient;
async function initializeSheetsClient() {
  let auth;

  // For Vercel deployment: use credentials from environment variable
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  // For local development: use keyFile
  else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  else {
    throw new Error('No Google service account credentials found. Set either GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_PATH');
  }

  sheetsClient = google.sheets({ version: 'v4', auth });
}

// Search for businesses using Google Places API
async function searchBusinesses(industry, zipCode) {
  const allBusinesses = [];
  let nextPageToken = null;

  do {
    const requestParams = {
      params: {
        query: `${industry} in ${zipCode}`,
        key: process.env.GOOGLE_PLACES_API_KEY,
      }
    };

    if (nextPageToken) {
      requestParams.params.pagetoken = nextPageToken;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const response = await placesClient.textSearch(requestParams);

    if (response.data.results) {
      allBusinesses.push(...response.data.results);
    }

    nextPageToken = response.data.next_page_token;
  } while (nextPageToken);

  return allBusinesses;
}

// Get detailed information for a business
async function getBusinessDetails(placeId) {
  try {
    const response = await placesClient.placeDetails({
      params: {
        place_id: placeId,
        fields: 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total',
        key: process.env.GOOGLE_PLACES_API_KEY,
      }
    });
    return response.data.result;
  } catch (error) {
    console.error(`Error getting details for place ${placeId}:`, error.message);
    return null;
  }
}

// Extract city from address
function extractCity(formattedAddress) {
  if (!formattedAddress) return 'N/A';

  // Address format is usually: "Street, City, State ZIP, Country"
  const parts = formattedAddress.split(',');

  // City is typically the second part
  if (parts.length >= 2) {
    return parts[1].trim();
  }

  return 'N/A';
}

// Extract state from address
function extractState(formattedAddress) {
  if (!formattedAddress) return '';

  // Address format is usually: "Street, City, State ZIP, Country"
  const parts = formattedAddress.split(',');

  // State is typically the third part
  if (parts.length >= 3) {
    // Extract just the state abbreviation (e.g., "MA" from "MA 02180")
    const statePart = parts[2].trim();
    const stateMatch = statePart.match(/^([A-Z]{2})/);
    return stateMatch ? stateMatch[1] : '';
  }

  return '';
}

// Verify if business has a website via Google Custom Search
async function verifyWebsiteViaGoogleSearch(businessName, city, state) {
  const customSearchApiKey = process.env.CUSTOM_SEARCH_KEY;
  const customSearchEngineId = process.env.CUSTOM_SEARCH_ID;

  if (!customSearchApiKey || !customSearchEngineId) {
    console.log('⚠️  Google Custom Search not configured, skipping verification');
    return false; // Assume no website if we can't verify
  }

  try {
    console.log(`🔍 Google Search: Checking "${businessName}" in ${city}, ${state}`);
    const query = `"${businessName}" "${city}" "${state}" website`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${customSearchApiKey}&cx=${customSearchEngineId}&q=${encodeURIComponent(query)}&num=5`;

    const response = await axios.get(url);
    console.log(`✓ Google Search API responded (${response.data.searchInformation?.totalResults || 0} results)`);

    if (response.data.items && response.data.items.length > 0) {
      // Check if any of the top results contain a website for this business
      const results = response.data.items;

      for (const item of results) {
        const title = item.title.toLowerCase();
        const snippet = item.snippet.toLowerCase();
        const link = item.link.toLowerCase();

        // Look for indicators this is an official website
        const businessNameLower = businessName.toLowerCase();

        // Check if the domain contains the business name
        if (link.includes(businessNameLower.replace(/\s+/g, '')) ||
            link.includes(businessNameLower.replace(/\s+/g, '-'))) {
          console.log(`✓ Found website for ${businessName}: ${item.link}`);
          return true; // Website found!
        }
      }
    }

    console.log(`✓ No website found in search results for ${businessName}`);
    return false; // No website found
  } catch (error) {
    console.error(`❌ Error verifying website for ${businessName}:`, error.message);
    return false; // Assume no website if error
  }
}

// Lookup decision maker via Apollo API
async function lookupDecisionMaker(businessName, city, state) {
  const apolloApiKey = process.env.APOLLO_KEY;

  if (!apolloApiKey) {
    console.log('⚠️  Apollo API not configured, skipping decision maker lookup');
    return null;
  }

  try {
    console.log(`👤 Apollo: Looking up decision maker for "${businessName}"`);
    // Search for the organization in Apollo
    const searchResponse = await axios.post(
      'https://api.apollo.io/v1/organizations/search',
      {
        q_organization_name: businessName,
        page: 1,
        per_page: 1
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apolloApiKey
        }
      }
    );

    if (searchResponse.data.organizations && searchResponse.data.organizations.length > 0) {
      const org = searchResponse.data.organizations[0];
      const orgId = org.id;
      console.log(`✓ Found organization in Apollo: ${org.name}`);

      // Get people at the organization
      const peopleResponse = await axios.post(
        'https://api.apollo.io/v1/mixed_people/search',
        {
          organization_ids: [orgId],
          person_titles: ['owner', 'ceo', 'president', 'managing partner', 'founder', 'partner'],
          page: 1,
          per_page: 1
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': apolloApiKey
          }
        }
      );

      if (peopleResponse.data.people && peopleResponse.data.people.length > 0) {
        const person = peopleResponse.data.people[0];

        // Get phone number if available
        let phone = '';
        if (person.phone_numbers && person.phone_numbers.length > 0) {
          phone = person.phone_numbers[0].sanitized_number || person.phone_numbers[0].raw_number || '';
        }

        console.log(`✓ Found decision maker: ${person.first_name} ${person.last_name} (${person.title || 'N/A'})`);
        return {
          name: `${person.first_name} ${person.last_name}`,
          title: person.title || 'Decision Maker',
          phone: phone
        };
      } else {
        console.log(`ℹ️  No decision maker found for ${businessName}`);
      }
    } else {
      console.log(`ℹ️  Organization "${businessName}" not found in Apollo`);
    }

    return null; // No decision maker found
  } catch (error) {
    console.error(`❌ Apollo API error for ${businessName}:`, error.message);
    return null;
  }
}

// Filter businesses without websites
async function filterBusinessesWithoutWebsites(businesses) {
  const businessesWithoutWebsites = [];

  for (let i = 0; i < businesses.length; i++) {
    const business = businesses[i];

    // Show progress
    if ((i + 1) % 5 === 0) {
      console.log(`Checking ${i + 1}/${businesses.length} businesses...`);
    }

    const details = await getBusinessDetails(business.place_id);

    if (!details) {
      continue; // Skip if we couldn't get details
    }

    // Step 1: Check if website is listed in Google Places
    if (details.website) {
      console.log(`${details.name}: Has website in Google Places (${details.website}) - SKIPPING`);
      await new Promise(resolve => setTimeout(resolve, 100));
      continue; // Skip this business
    }

    console.log(`${details.name}: No website in Google Places - Verifying...`);

    // Step 2: Verify via Google Custom Search
    const city = extractCity(details.formatted_address);
    const state = extractState(details.formatted_address);

    const hasWebsiteViaSearch = await verifyWebsiteViaGoogleSearch(details.name, city, state);

    if (hasWebsiteViaSearch) {
      console.log(`${details.name}: Found website via Google Search - SKIPPING`);
      await new Promise(resolve => setTimeout(resolve, 100));
      continue; // Skip this business
    }

    console.log(`${details.name}: No website found - Adding to list`);

    // Step 3: Lookup decision maker via Apollo
    const decisionMaker = await lookupDecisionMaker(details.name, city, state);

    // Add to list with all information
    businessesWithoutWebsites.push({
      name: details.name,
      city: city,
      businessPhone: details.formatted_phone_number || 'N/A',
      dmName: decisionMaker ? decisionMaker.name : 'N/A',
      dmTitle: decisionMaker ? decisionMaker.title : 'N/A',
      dmPhone: decisionMaker ? decisionMaker.phone : 'N/A',
    });

    if (decisionMaker) {
      console.log(`${details.name}: Found decision maker - ${decisionMaker.name} (${decisionMaker.title})`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return businessesWithoutWebsites;
}

// Write results to Google Sheets
async function writeToGoogleSheets(businesses, industry, zipCode) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const MASTER_SHEET_NAME = 'All Businesses';
  const timestamp = new Date().toLocaleString();

  let sheetId;
  let isNewSheet = false;

  // Get or create the master sheet
  try {
    const spreadsheet = await sheetsClient.spreadsheets.get({
      spreadsheetId,
    });

    const masterSheet = spreadsheet.data.sheets.find(s => s.properties.title === MASTER_SHEET_NAME);

    if (masterSheet) {
      // Sheet exists, get its ID
      sheetId = masterSheet.properties.sheetId;
    } else {
      // Sheet doesn't exist, create it
      const response = await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: {
                title: MASTER_SHEET_NAME
              }
            }
          }]
        }
      });
      sheetId = response.data.replies[0].addSheet.properties.sheetId;
      isNewSheet = true;
    }
  } catch (error) {
    console.error('Error accessing/creating sheet:', error);
    throw error;
  }

  // If new sheet, add headers
  if (isNewSheet) {
    const headers = [
      ['Business Name', 'City', 'Phone Number', 'Industry', 'ZIP Code', 'DM Name', 'DM Title', 'DM Phone', 'Called?', 'Notes']
    ];

    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${MASTER_SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: headers
      }
    });

    // Make header row bold
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: true
                }
              }
            },
            fields: 'userEnteredFormat.textFormat.bold'
          }
        }]
      }
    });
  }

  // Find the next empty row
  const existingData = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${MASTER_SHEET_NAME}!A:A`,
  });

  const nextRow = existingData.data.values ? existingData.data.values.length + 1 : 2;

  // Prepare new data rows with new column order
  const dataRows = businesses.map(b => [
    b.name,           // Business Name
    b.city,           // City
    b.businessPhone,  // Phone Number
    industry,         // Industry
    zipCode,          // ZIP Code
    b.dmName,         // DM Name
    b.dmTitle,        // DM Title
    b.dmPhone,        // DM Phone
    false,            // Called? (checkbox)
    ''                // Notes
  ]);

  // Append data to the bottom
  await sheetsClient.spreadsheets.values.append({
    spreadsheetId,
    range: `${MASTER_SHEET_NAME}!A${nextRow}`,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: dataRows
    }
  });

  // Add checkboxes and conditional formatting for new rows
  const requests = [
    // Add checkboxes to the "Called?" column (column I, index 8)
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: nextRow - 1,
          endRowIndex: nextRow - 1 + businesses.length,
          startColumnIndex: 8,
          endColumnIndex: 9
        },
        rule: {
          condition: {
            type: 'BOOLEAN'
          },
          showCustomUi: true
        }
      }
    },
    // Add conditional formatting: gray out checked rows
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId: sheetId,
            startRowIndex: nextRow - 1,
            endRowIndex: nextRow - 1 + businesses.length,
            startColumnIndex: 0,
            endColumnIndex: 10
          }],
          booleanRule: {
            condition: {
              type: 'CUSTOM_FORMULA',
              values: [{
                userEnteredValue: `=$I${nextRow}=TRUE`
              }]
            },
            format: {
              backgroundColor: {
                red: 0.85,
                green: 0.85,
                blue: 0.85
              }
            }
          }
        },
        index: 0
      }
    }
  ];

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests }
  });

  console.log(`Added ${businesses.length} businesses to "${MASTER_SHEET_NAME}" sheet`);
  return MASTER_SHEET_NAME;
}

// Initialize sheets client on startup
let sheetsInitialized = false;
async function ensureSheetsClient() {
  if (!sheetsInitialized) {
    await initializeSheetsClient();
    sheetsInitialized = true;
    console.log('✓ Google Sheets API initialized');
  }
}

// API endpoint for scraping
app.post('/api/scrape', async (req, res) => {
  try {
    // Ensure sheets client is initialized
    await ensureSheetsClient();

    // Debug: Check API configuration (v2)
    console.log('🔧 API Configuration Check:');
    console.log('  Custom Search Key:', process.env.CUSTOM_SEARCH_KEY ? '✓ SET' : '❌ MISSING');
    console.log('  Custom Search Engine ID:', process.env.CUSTOM_SEARCH_ID ? '✓ SET' : '❌ MISSING');
    console.log('  Apollo Key:', process.env.APOLLO_KEY ? '✓ SET' : '❌ MISSING');

    // Debug: Show all environment variable names (not values)
    console.log('🔍 All env vars starting with GOOGLE_ or APOLLO_ or CUSTOM_:');
    Object.keys(process.env).filter(key => key.startsWith('GOOGLE_') || key.startsWith('APOLLO_') || key.startsWith('CUSTOM_')).forEach(key => {
      console.log(`  ${key}: ${process.env[key] ? 'has value' : 'empty'}`);
    });

    const { industry, zipCode } = req.body;

    if (!industry || !zipCode) {
      return res.status(400).json({ error: 'Industry and ZIP code are required' });
    }

    console.log(`\nStarting search for "${industry}" in ${zipCode}...`);

    // Search for businesses
    const businesses = await searchBusinesses(industry, zipCode);
    console.log(`Found ${businesses.length} total businesses`);

    if (businesses.length === 0) {
      return res.json({
        totalBusinesses: 0,
        businessesWithoutWebsites: 0,
        message: 'No businesses found'
      });
    }

    // Filter businesses without websites
    const businessesWithoutWebsites = await filterBusinessesWithoutWebsites(businesses);
    console.log(`Found ${businessesWithoutWebsites.length} businesses without websites`);

    // Write to Google Sheets
    if (businessesWithoutWebsites.length > 0) {
      const sheetName = await writeToGoogleSheets(businessesWithoutWebsites, industry, zipCode);
      console.log(`Results written to sheet: ${sheetName}`);

      return res.json({
        totalBusinesses: businesses.length,
        businessesWithoutWebsites: businessesWithoutWebsites.length,
        sheetName,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}`
      });
    } else {
      return res.json({
        totalBusinesses: businesses.length,
        businessesWithoutWebsites: 0,
        message: 'All businesses have websites!'
      });
    }

  } catch (error) {
    console.error('Error during scraping:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Business Website Finder API is running' });
});

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export for Vercel
module.exports = app;
