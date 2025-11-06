// Local development server
// This file is for running the app locally with: npm run web
// For Vercel deployment, index.js is used instead

const app = require('./index.js');
const PORT = process.env.PORT || 3000;

// Start server for local development
app.listen(PORT, () => {
  console.log(`\n🚀 Business Website Finder is running!`);
  console.log(`\n   Open your browser and go to: http://localhost:${PORT}`);
  console.log(`\n   Ready to find businesses without websites!\n`);
});
