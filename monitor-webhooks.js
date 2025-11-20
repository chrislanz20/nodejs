#!/usr/bin/env node

/**
 * Real-Time Webhook Monitor for Retell Call Notifications
 *
 * This script monitors incoming webhooks and verifies the complete notification flow:
 * 1. Webhook received from Retell
 * 2. Call categorized by Claude AI
 * 3. Incident data extracted
 * 4. Notifications sent via GoHighLevel
 *
 * Usage: node monitor-webhooks.js
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                  WEBHOOK MONITORING SYSTEM                     ║
║                                                                ║
║  Monitoring: https://nodejs-1bogy8x99-chris-lanzillis-        ║
║              projects.vercel.app/webhook/retell-call-ended    ║
║                                                                ║
║  This will show real-time webhook activity and verify:        ║
║  ✓ Webhook received                                           ║
║  ✓ Call categorized                                           ║
║  ✓ Notifications sent to GoHighLevel                          ║
║                                                                ║
║  Press Ctrl+C to stop monitoring                              ║
╚════════════════════════════════════════════════════════════════╝
`);

// Track last log timestamp to only show new logs
let lastTimestamp = new Date().toISOString();
let webhookCount = 0;

async function checkVercelLogs() {
  try {
    // Get logs from last 5 minutes
    const { stdout } = await execPromise('vercel logs nodejs-1bogy8x99 --since 5m 2>/dev/null || true');

    if (!stdout) return;

    const lines = stdout.split('\n');
    const relevantLogs = [];

    for (const line of lines) {
      if (line.includes('📞 Retell webhook received') ||
          line.includes('📧 Sending notifications') ||
          line.includes('✅ Email sent') ||
          line.includes('✅ SMS sent') ||
          line.includes('Category:') ||
          line.includes('❌')) {
        relevantLogs.push(line);
      }
    }

    if (relevantLogs.length > 0) {
      console.log('\n' + '='.repeat(70));
      console.log(`[${new Date().toLocaleTimeString()}] New Activity Detected:`);
      console.log('='.repeat(70));
      relevantLogs.forEach(log => console.log(log));
    }

  } catch (error) {
    // Silently handle errors (vercel CLI might not be available)
  }
}

async function checkDatabaseForRecentCalls() {
  try {
    const { stdout } = await execPromise(`
      PGPASSWORD="${process.env.POSTGRES_PASSWORD}" psql \\
        -h ${process.env.POSTGRES_HOST} \\
        -U ${process.env.POSTGRES_USER} \\
        -d ${process.env.POSTGRES_DATABASE} \\
        -c "SELECT call_id, category, created_at FROM leads ORDER BY created_at DESC LIMIT 5;" \\
        2>/dev/null || true
    `);

    if (stdout && stdout.includes('New Lead')) {
      console.log('\n📊 Recent Database Entries:');
      console.log(stdout);
    }
  } catch (error) {
    // Database check is optional
  }
}

async function testWebhookEndpoint() {
  console.log('\n🔍 Testing webhook endpoint accessibility...\n');

  try {
    const { stdout } = await execPromise(`
      curl -s -o /dev/null -w "HTTP Status: %{http_code}\\nResponse Time: %{time_total}s\\n" \\
        -X POST \\
        -H "Content-Type: application/json" \\
        -d '{"test": true}' \\
        https://nodejs-1bogy8x99-chris-lanzillis-projects.vercel.app/webhook/retell-call-ended
    `);

    console.log('✅ Endpoint Test Result:');
    console.log(stdout);

    if (stdout.includes('200')) {
      console.log('✓ Webhook endpoint is responding correctly\n');
    } else {
      console.log('⚠ Unexpected status code - may need investigation\n');
    }
  } catch (error) {
    console.error('❌ Error testing endpoint:', error.message);
  }
}

async function monitorLoop() {
  // Initial endpoint test
  await testWebhookEndpoint();

  console.log('👀 Monitoring for incoming webhooks...\n');
  console.log('Waiting for next call to come in...\n');

  // Check every 10 seconds
  setInterval(async () => {
    await checkVercelLogs();
  }, 10000);

  // Check database every 30 seconds
  setInterval(async () => {
    await checkDatabaseForRecentCalls();
  }, 30000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n✋ Monitoring stopped by user');
  console.log(`📊 Total webhooks detected: ${webhookCount}`);
  process.exit(0);
});

// Start monitoring
monitorLoop();
