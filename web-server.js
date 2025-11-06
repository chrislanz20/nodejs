const express = require('express');
const path = require('path');
const { Client } = require('@googlemaps/google-maps-services-js');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize Google APIs
const placesClient = new Client({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

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
        key: placesApiKey,
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
        key: placesApiKey,
      }
    });
    return response.data.result;
  } catch (error) {
    console.error(`Error getting details for place ${placeId}:`, error.message);
    return null;
  }
}

// Filter businesses without websites
async function filterBusinessesWithoutWebsites(businesses) {
  const businessesWithoutWebsites = [];

  for (const business of businesses) {
    const details = await getBusinessDetails(business.place_id);

    if (details && !details.website) {
      businessesWithoutWebsites.push({
        name: details.name,
        address: details.formatted_address,
        phone: details.formatted_phone_number || 'N/A',
        rating: details.rating || 'N/A',
        reviewCount: details.user_ratings_total || 0,
        placeId: business.place_id
      });
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return businessesWithoutWebsites;
}

// Write results to Google Sheets
async function writeToGoogleSheets(businesses, industry, zipCode) {
  const timestamp = new Date().toLocaleString();
  const sheetName = `${industry} - ${zipCode}`.substring(0, 100);

  // Create a new sheet
  try {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          addSheet: {
            properties: {
              title: sheetName
            }
          }
        }]
      }
    });
  } catch (error) {
    // Sheet might already exist
    if (!error.message.includes('already exists')) {
      throw error;
    }
  }

  // Prepare data
  const headers = [
    ['Search Date', 'Industry', 'ZIP Code', '', 'Businesses Without Websites'],
    [timestamp, industry, zipCode],
    [],
    ['Business Name', 'Address', 'Phone', 'Rating', 'Review Count', 'Google Place ID']
  ];

  const dataRows = businesses.map(b => [
    b.name,
    b.address,
    b.phone,
    b.rating,
    b.reviewCount,
    b.placeId
  ]);

  const allRows = [...headers, ...dataRows];

  // Write to sheet
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    resource: {
      values: allRows
    }
  });

  return sheetName;
}

// API endpoint for scraping
app.post('/api/scrape', async (req, res) => {
  try {
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
        sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
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

// Start server
async function startServer() {
  try {
    await initializeSheetsClient();
    console.log('✓ Google Sheets API initialized');

    app.listen(PORT, () => {
      console.log(`\n🚀 Business Website Finder is running!`);
      console.log(`\n   Open your browser and go to: http://localhost:${PORT}`);
      console.log(`\n   Ready to find businesses without websites!\n`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

startServer();
