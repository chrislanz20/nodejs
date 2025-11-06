const { Client } = require('@googlemaps/google-maps-services-js');
const { google } = require('googleapis');
const readlineSync = require('readline-sync');
require('dotenv').config();

class BusinessScraper {
  constructor() {
    this.placesClient = new Client({});
    this.placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
    this.sheetsClient = null;
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
  }

  /**
   * Initialize Google Sheets API client
   */
  async initializeSheetsClient() {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheetsClient = google.sheets({ version: 'v4', auth });
      console.log('✓ Google Sheets API initialized successfully');
    } catch (error) {
      console.error('Error initializing Google Sheets:', error.message);
      throw error;
    }
  }

  /**
   * Search for businesses using Google Places API
   */
  async searchBusinesses(industry, zipCode) {
    console.log(`\nSearching for "${industry}" in ${zipCode}...`);

    const allBusinesses = [];
    let nextPageToken = null;

    try {
      do {
        const requestParams = {
          params: {
            query: `${industry} in ${zipCode}`,
            key: this.placesApiKey,
          }
        };

        if (nextPageToken) {
          requestParams.params.pagetoken = nextPageToken;
          // Google requires a short delay between page token requests
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const response = await this.placesClient.textSearch(requestParams);

        if (response.data.results) {
          allBusinesses.push(...response.data.results);
          console.log(`Found ${response.data.results.length} businesses (total: ${allBusinesses.length})`);
        }

        nextPageToken = response.data.next_page_token;

      } while (nextPageToken);

      console.log(`✓ Total businesses found: ${allBusinesses.length}`);
      return allBusinesses;

    } catch (error) {
      console.error('Error searching businesses:', error.message);
      if (error.response?.data) {
        console.error('API Error:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Get detailed information for a business
   */
  async getBusinessDetails(placeId) {
    try {
      const response = await this.placesClient.placeDetails({
        params: {
          place_id: placeId,
          fields: 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total',
          key: this.placesApiKey,
        }
      });

      return response.data.result;
    } catch (error) {
      console.error(`Error getting details for place ${placeId}:`, error.message);
      return null;
    }
  }

  /**
   * Filter businesses that don't have websites
   */
  async filterBusinessesWithoutWebsites(businesses) {
    console.log('\nChecking which businesses don\'t have websites...');
    const businessesWithoutWebsites = [];

    for (let i = 0; i < businesses.length; i++) {
      const business = businesses[i];

      // Show progress
      if ((i + 1) % 10 === 0) {
        console.log(`Processed ${i + 1}/${businesses.length} businesses...`);
      }

      // Get detailed information
      const details = await this.getBusinessDetails(business.place_id);

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

      // Rate limiting: small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✓ Found ${businessesWithoutWebsites.length} businesses WITHOUT websites`);
    return businessesWithoutWebsites;
  }

  /**
   * Write results to Google Sheets
   */
  async writeToGoogleSheets(businesses, industry, zipCode) {
    console.log('\nWriting results to Google Sheets...');

    try {
      const timestamp = new Date().toLocaleString();
      const sheetName = `${industry} - ${zipCode}`.substring(0, 100); // Sheet name limit

      // Create a new sheet for this search
      try {
        await this.sheetsClient.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
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
        console.log(`✓ Created new sheet: "${sheetName}"`);
      } catch (error) {
        // Sheet might already exist, that's okay
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }

      // Prepare data rows
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
      await this.sheetsClient.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        resource: {
          values: allRows
        }
      });

      console.log(`✓ Successfully wrote ${businesses.length} businesses to Google Sheets`);
      console.log(`  Sheet: "${sheetName}"`);

    } catch (error) {
      console.error('Error writing to Google Sheets:', error.message);
      throw error;
    }
  }

  /**
   * Main execution function
   */
  async run() {
    console.log('\n=== Business Website Scraper ===\n');

    try {
      // Initialize Google Sheets
      await this.initializeSheetsClient();

      // Get user input
      const industry = readlineSync.question('Enter industry (e.g., "law firms", "restaurants"): ');
      const zipCode = readlineSync.question('Enter ZIP code (e.g., "02180"): ');

      if (!industry || !zipCode) {
        console.error('Industry and ZIP code are required!');
        return;
      }

      // Search for businesses
      const businesses = await this.searchBusinesses(industry, zipCode);

      if (businesses.length === 0) {
        console.log('No businesses found. Try different search terms.');
        return;
      }

      // Filter businesses without websites
      const businessesWithoutWebsites = await this.filterBusinessesWithoutWebsites(businesses);

      if (businessesWithoutWebsites.length === 0) {
        console.log('\nAll businesses in this search have websites!');
        return;
      }

      // Display results
      console.log('\n=== Results ===');
      console.log(`Total businesses found: ${businesses.length}`);
      console.log(`Businesses WITHOUT websites: ${businessesWithoutWebsites.length}`);
      console.log(`\nFirst few businesses without websites:`);
      businessesWithoutWebsites.slice(0, 5).forEach((b, i) => {
        console.log(`${i + 1}. ${b.name}`);
        console.log(`   Address: ${b.address}`);
        console.log(`   Phone: ${b.phone}`);
        console.log('');
      });

      // Write to Google Sheets
      await this.writeToGoogleSheets(businessesWithoutWebsites, industry, zipCode);

      console.log('\n✓ Process completed successfully!\n');

    } catch (error) {
      console.error('\n✗ Error:', error.message);
      process.exit(1);
    }
  }
}

// Run the scraper
if (require.main === module) {
  const scraper = new BusinessScraper();
  scraper.run();
}

module.exports = BusinessScraper;
