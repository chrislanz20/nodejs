# Business Website Finder - Web App

## 🎯 Easy-to-Use Web Interface

No command line needed! Just open your browser and start finding businesses without websites.

## Quick Start

### 1. Start the Web Server

```bash
npm run web
```

You'll see:
```
✓ Google Sheets API initialized

🚀 Business Website Finder is running!

   Open your browser and go to: http://localhost:3000

   Ready to find businesses without websites!
```

### 2. Open Your Browser

Go to: **http://localhost:3000**

### 3. Use the App

1. **Type the industry** (e.g., "law firms", "dentists", "restaurants")
2. **Type the ZIP code** (e.g., "02180")
3. **Click "Start Search"**

The app will:
- Search Google Places for matching businesses
- Check which ones don't have websites
- Automatically save results to your Google Spreadsheet
- Show you the stats and a link to view the results

## Features

✅ Beautiful, simple interface
✅ Real-time progress bar
✅ Instant results display
✅ Direct link to Google Sheets with results
✅ No technical knowledge required

## Example Searches

- **Law firms in 02180**
- **Plumbers in 90210**
- **Italian restaurants in 10001**
- **Dentists in 60601**

## How to Stop the Server

Press `Ctrl + C` in the terminal where the server is running.

## Troubleshooting

**Port already in use?**
```bash
# Use a different port
PORT=4000 npm run web
```

Then go to `http://localhost:4000`

**Can't connect?**
- Make sure the server is still running in the terminal
- Check that you're using `http://localhost:3000` (not https)
- Try refreshing the page

## Legal & Safe ✅

This uses official Google APIs - completely legal and safe to use for legitimate business purposes like market research.

---

**Have fun finding potential clients! 🚀**
