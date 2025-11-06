# Quick Start Guide - Business Scraper

## What You Need Before Running

### 1. Service Account JSON Key
- Download from: Google Cloud Console → IAM & Admin → Service Accounts → Your Service Account → Keys → Add Key → Create New Key (JSON)
- Save as: `service-account-key.json` in this directory

### 2. Google Spreadsheet
- Create a new Google Sheet at https://sheets.google.com
- Copy the ID from the URL (the long string between `/d/` and `/edit`)
- Share it with your service account email (found in the JSON file as `client_email`)
- Give the service account **Editor** access

### 3. Update `.env` file
Open `.env` and add your Spreadsheet ID:
```
GOOGLE_SHEET_ID=your_spreadsheet_id_here
```

### 4. Enable Google Sheets API
- Go to: https://console.cloud.google.com/apis/library
- Search for "Google Sheets API"
- Click **Enable** if not already enabled

## Installation

```bash
npm install
```

## Run the Scraper

```bash
npm run scrape
```

Or:

```bash
node business-scraper.js
```

## Example

```
Enter industry: law firms
Enter ZIP code: 02180
```

The results will appear in your Google Spreadsheet!

## Need More Help?

See `SETUP_GUIDE.md` for detailed instructions.
