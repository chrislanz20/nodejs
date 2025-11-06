# Business Website Scraper - Setup Guide

This application helps you identify businesses in a specific area and industry that don't have websites listed on Google. Perfect for finding potential web development clients!

## What This App Does

1. Takes an industry (e.g., "law firms") and ZIP code (e.g., "02180") as input
2. Searches Google Places for all matching businesses
3. Filters out businesses that have websites
4. Exports the list of businesses WITHOUT websites to Google Sheets

## Prerequisites

- Node.js 18 or higher
- A Google Cloud Project with:
  - Places API enabled
  - Google Sheets API enabled
  - A service account with credentials

## Setup Instructions

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Set Up Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project
3. Go to **IAM & Admin** → **Service Accounts**
4. Find your service account (or create one if needed)
5. Click on the service account
6. Go to **Keys** tab
7. Click **Add Key** → **Create New Key**
8. Choose **JSON** format
9. Download the file and save it as `service-account-key.json` in this directory

### Step 3: Create a Google Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet (name it something like "Businesses Without Websites")
3. Copy the Spreadsheet ID from the URL:
   - URL format: `https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit`
   - Copy the `YOUR_SPREADSHEET_ID` part

### Step 4: Share the Spreadsheet with Service Account

1. Open your `service-account-key.json` file
2. Find the `client_email` field (looks like: `your-service@project.iam.gserviceaccount.com`)
3. Go back to your Google Spreadsheet
4. Click **Share** button
5. Paste the service account email
6. Give it **Editor** access
7. Uncheck "Notify people" and click **Share**

### Step 5: Configure Environment Variables

1. Open the `.env` file in this directory
2. Update the following values:

```env
# Your Google Places API Key (already filled in)
GOOGLE_PLACES_API_KEY=AIzaSyA_9R23VGUfflPgXZU6woiiD8NH6nTJ1LM

# Path to your service account key file
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./service-account-key.json

# Your Spreadsheet ID from Step 3
GOOGLE_SHEET_ID=paste_your_spreadsheet_id_here
```

### Step 6: Verify APIs are Enabled

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Go to **APIs & Services** → **Enabled APIs & services**
3. Make sure these are enabled:
   - **Places API** ✓
   - **Google Sheets API** (if not enabled, click **+ ENABLE APIS AND SERVICES** and search for "Google Sheets API")

## Running the Application

Once setup is complete, run:

```bash
node business-scraper.js
```

The app will prompt you for:
1. **Industry** - e.g., "law firms", "restaurants", "dentists", "plumbers"
2. **ZIP Code** - e.g., "02180", "10001", "90210"

### Example Usage

```
=== Business Website Scraper ===

✓ Google Sheets API initialized successfully

Enter industry (e.g., "law firms", "restaurants"): law firms
Enter ZIP code (e.g., "02180"): 02180

Searching for "law firms" in 02180...
Found 20 businesses (total: 20)
✓ Total businesses found: 20

Checking which businesses don't have websites...
Processed 10/20 businesses...
Processed 20/20 businesses...
✓ Found 8 businesses WITHOUT websites

=== Results ===
Total businesses found: 20
Businesses WITHOUT websites: 8

First few businesses without websites:
1. Smith & Associates Law
   Address: 123 Main St, Stoneham, MA 02180
   Phone: (781) 555-1234

...

Writing results to Google Sheets...
✓ Created new sheet: "law firms - 02180"
✓ Successfully wrote 8 businesses to Google Sheets
  Sheet: "law firms - 02180"

✓ Process completed successfully!
```

## Output Format

The app creates a new sheet in your Google Spreadsheet for each search with:
- Search date and parameters
- Business name
- Full address
- Phone number
- Google rating
- Number of reviews
- Google Place ID

## Tips for Best Results

1. **Be specific with industry terms**: Use terms like "personal injury lawyers" instead of just "lawyers"
2. **Try variations**: "restaurants", "italian restaurants", "pizza places" will give different results
3. **Search multiple ZIP codes**: Run the tool for different areas to build a larger prospect list
4. **Rate limits**: The Google Places API has usage limits. The app includes delays to avoid hitting rate limits.

## Troubleshooting

### "Error initializing Google Sheets"
- Make sure `service-account-key.json` exists in the project directory
- Verify the path in `.env` is correct
- Check that Google Sheets API is enabled in your Google Cloud project

### "Permission denied" on Google Sheets
- Make sure you shared the spreadsheet with your service account email
- The service account needs Editor access

### "Invalid API key" or "API key not valid"
- Verify your Google Places API key is correct in `.env`
- Make sure Places API is enabled in Google Cloud Console
- Check that your API key has no restrictions that would block it

### No businesses found
- Try different search terms
- Verify the ZIP code is valid
- Try using city name instead: "law firms in Boston, MA"

## Cost Considerations

- **Google Places API**: Charges per request (Text Search, Place Details)
  - Check current pricing: https://mapsplatform.google.com/pricing/
  - Google provides $200 free credit per month
- **Google Sheets API**: Free for most use cases

## Need Help?

If you encounter issues:
1. Check the error messages - they usually indicate what's wrong
2. Verify all setup steps were completed
3. Check the [Google Cloud Console](https://console.cloud.google.com) for API quotas and billing

---

Happy prospecting! 🚀
