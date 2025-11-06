# Deploy to Vercel - Step by Step Guide

Deploy your Business Website Finder app to Vercel so you can access it from anywhere!

## Prerequisites

✅ You already have:
- GitHub repository (this project)
- Google Places API key
- Google service account JSON file
- Google Spreadsheet ID

## Step 1: Push to GitHub

Your code is already on GitHub! If you need to update it:

```bash
git add -A
git commit -m "Ready for Vercel deployment"
git push
```

## Step 2: Sign Up for Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **Sign Up**
3. Choose **Continue with GitHub**
4. Authorize Vercel to access your GitHub account

## Step 3: Import Your Project

1. Once logged in, click **Add New Project**
2. Find your `nodejs` repository in the list
3. Click **Import**

## Step 4: Configure Build Settings

Vercel should auto-detect these settings, but verify:

- **Framework Preset**: Other
- **Build Command**: (leave empty)
- **Output Directory**: (leave empty)
- **Install Command**: `npm install`

Click **Continue** or scroll down to environment variables.

## Step 5: Add Environment Variables

This is the MOST IMPORTANT step! Click **Environment Variables** and add these:

### 1. GOOGLE_PLACES_API_KEY
- **Name**: `GOOGLE_PLACES_API_KEY`
- **Value**: `AIzaSyA_9R23VGUfflPgXZU6woiiD8NH6nTJ1LM`
- Select: ✅ Production, ✅ Preview, ✅ Development

### 2. GOOGLE_SHEET_ID
- **Name**: `GOOGLE_SHEET_ID`
- **Value**: `1dj69Ek8KpItEJW_cvjH2bY7oWoazC6hlHOT4Lxm-0sU`
- Select: ✅ Production, ✅ Preview, ✅ Development

### 3. GOOGLE_SERVICE_ACCOUNT_JSON

This one is tricky - you need to paste the **entire** contents of your `service-account-key.json` file:

- **Name**: `GOOGLE_SERVICE_ACCOUNT_JSON`
- **Value**: Open `service-account-key.json`, copy ALL the contents (the entire JSON object starting with `{` and ending with `}`), and paste it here
- Select: ✅ Production, ✅ Preview, ✅ Development

**Example of what to paste:**
```json
{"type":"service_account","project_id":"n8n-apollo-leads","private_key_id":"4c0128488cc33d7a504e9ce5cb839b6c188fffa1","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDHRqupE5lom6Lj\n...entire key here...\n-----END PRIVATE KEY-----\n","client_email":"claude-sheets-access@n8n-apollo-leads.iam.gserviceaccount.com",...}
```

**Important**: It should be ONE line with no extra spaces or line breaks!

## Step 6: Deploy!

1. Click **Deploy**
2. Wait 1-2 minutes for the deployment to complete
3. You'll see a success screen with your live URL!

Your app will be live at something like: `https://nodejs-abc123.vercel.app`

## Step 7: Test Your Deployment

1. Click on the Vercel URL
2. You should see your Business Website Finder interface!
3. Try a test search (e.g., "law firms in 02180")
4. Check that results appear in your Google Spreadsheet

## Troubleshooting

### Error: "No Google service account credentials found"
- Make sure you added `GOOGLE_SERVICE_ACCOUNT_JSON` environment variable
- Verify the JSON is valid (should start with `{` and end with `}`)
- Check that you didn't add extra spaces or line breaks

### Error: "Invalid API key"
- Verify `GOOGLE_PLACES_API_KEY` is set correctly
- Make sure Places API is enabled in Google Cloud Console

### Error: "Permission denied" on Google Sheets
- Verify the spreadsheet is shared with your service account email
- Check that `GOOGLE_SHEET_ID` is correct

### Need to Update Environment Variables?
1. Go to your Vercel dashboard
2. Click on your project
3. Go to **Settings** → **Environment Variables**
4. Edit or add variables
5. **Redeploy** after making changes (Deployments tab → click "..." → Redeploy)

## Custom Domain (Optional)

Want a custom domain like `bizfinder.yourdomain.com`?

1. Go to your project in Vercel dashboard
2. Click **Settings** → **Domains**
3. Add your custom domain
4. Follow Vercel's DNS instructions

## Automatic Deployments

Great news! Every time you push to GitHub, Vercel will automatically:
- Build your app
- Deploy the new version
- Keep your environment variables secure

## Cost

**Vercel is FREE for personal projects!**
- Unlimited deployments
- Automatic HTTPS
- Global CDN

You only pay for Google API usage (but you get $200/month free credit).

## Share Your App!

Once deployed, you can:
- Share the Vercel URL with anyone
- Access it from your phone, tablet, anywhere
- No need to keep your computer running!

---

**Questions? Issues?** Check the Vercel logs in your dashboard for error details.

**Enjoy your live app! 🚀**
