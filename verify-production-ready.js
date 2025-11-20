#!/usr/bin/env node

/**
 * Comprehensive Production Readiness Verification
 *
 * This script verifies every component of the notification system:
 * - Retell webhook configuration
 * - GoHighLevel contact setup
 * - Database connectivity
 * - API endpoints accessibility
 * - Configuration correctness
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const CHECKS = {
  passed: [],
  failed: [],
  warnings: []
};

function logCheck(status, message) {
  const symbols = { pass: '✅', fail: '❌', warn: '⚠️' };
  console.log(`${symbols[status]} ${message}`);

  if (status === 'pass') CHECKS.passed.push(message);
  else if (status === 'fail') CHECKS.failed.push(message);
  else CHECKS.warnings.push(message);
}

console.log(`
╔════════════════════════════════════════════════════════════════╗
║           PRODUCTION READINESS VERIFICATION                    ║
║                                                                ║
║  Verifying all components before going live...                ║
╚════════════════════════════════════════════════════════════════╝
`);

async function checkRetellWebhook() {
  console.log('\n📡 RETELL WEBHOOK CONFIGURATION');
  console.log('─'.repeat(70));

  const agentId = 'agent_8e50b96f7e7bb7ce7479219fcc';
  const apiKey = process.env.RETELL_API_KEY;
  const expectedWebhook = 'https://nodejs-1bogy8x99-chris-lanzillis-projects.vercel.app/webhook/retell-call-ended';

  try {
    const response = await axios.get(
      `https://api.retellai.com/get-agent/${agentId}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );

    const webhookUrl = response.data.end_call_webhook_url || response.data.webhook_url;

    if (webhookUrl === expectedWebhook) {
      logCheck('pass', `Webhook URL correctly configured: ${webhookUrl}`);
    } else if (!webhookUrl) {
      logCheck('fail', 'Webhook URL is NOT configured!');
    } else {
      logCheck('warn', `Webhook URL mismatch: ${webhookUrl}`);
    }

    logCheck('pass', `Agent ID: ${agentId}`);
    logCheck('pass', `Agent Name: ${response.data.agent_name}`);

  } catch (error) {
    logCheck('fail', `Failed to verify Retell webhook: ${error.message}`);
  }
}

async function checkGoHighLevelConfig() {
  console.log('\n🚀 GOHIGHLEVEL CONFIGURATION');
  console.log('─'.repeat(70));

  const agentId = 'agent_8e50b96f7e7bb7ce7479219fcc';
  const configPath = path.join(__dirname, 'config', 'clients.js');

  try {
    // Read configuration file
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = eval(configContent.split('module.exports = ')[1].split(';')[0]);

    const clientConfig = config[agentId];

    if (!clientConfig) {
      logCheck('fail', 'Client configuration not found!');
      return;
    }

    logCheck('pass', `Client: ${clientConfig.client_name}`);
    logCheck('pass', `Mode: ${clientConfig.mode}`);
    logCheck('pass', `Location ID: ${clientConfig.ghl_location_id}`);

    // Check contact IDs
    const testContacts = clientConfig.ghl_contact_ids?.test || [];
    const prodContacts = clientConfig.ghl_contact_ids?.production || [];

    if (testContacts.length > 0) {
      logCheck('pass', `Test contacts configured: ${testContacts.length} contact(s)`);
      console.log(`   Contact ID: ${testContacts[0]}`);
    } else {
      logCheck('fail', 'No test contacts configured!');
    }

    if (prodContacts.length === 0) {
      logCheck('warn', 'Production contacts not yet configured (expected until going live)');
    }

    // Verify the contact exists in GoHighLevel
    const contactId = testContacts[0];
    if (contactId) {
      try {
        const contactResponse = await axios.get(
          `https://services.leadconnectorhq.com/contacts/${contactId}`,
          {
            headers: {
              'Authorization': `Bearer ${clientConfig.ghl_api_key}`,
              'Version': '2021-07-28'
            }
          }
        );

        const contact = contactResponse.data.contact;
        logCheck('pass', `Contact verified: ${contact.firstName} ${contact.lastName}`);
        logCheck('pass', `Email: ${contact.email}`);
        logCheck('pass', `Phone: ${contact.phone}`);

        // Verify correct email
        if (contact.email === '17lanzch@gmail.com') {
          logCheck('pass', 'Contact email is correct (17lanzch@gmail.com)');
        } else {
          logCheck('fail', `Contact email is wrong: ${contact.email}`);
        }

        // Verify phone
        if (contact.phone === '+17814757191') {
          logCheck('pass', 'Contact phone is correct (+17814757191)');
        } else {
          logCheck('warn', `Contact phone: ${contact.phone}`);
        }

      } catch (error) {
        logCheck('fail', `Failed to verify GoHighLevel contact: ${error.message}`);
      }
    }

  } catch (error) {
    logCheck('fail', `Failed to check configuration: ${error.message}`);
  }
}

async function checkDatabaseConnection() {
  console.log('\n💾 DATABASE CONNECTION');
  console.log('─'.repeat(70));

  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);

  try {
    const { stdout } = await execPromise(`
      PGPASSWORD="${process.env.POSTGRES_PASSWORD}" psql \\
        -h ${process.env.POSTGRES_HOST} \\
        -U ${process.env.POSTGRES_USER} \\
        -d ${process.env.POSTGRES_DATABASE} \\
        -c "SELECT COUNT(*) FROM leads;" \\
        2>&1
    `);

    if (stdout.includes('count')) {
      logCheck('pass', 'Database connection successful');
      const count = stdout.match(/\d+/)?.[0];
      if (count) {
        logCheck('pass', `Total leads in database: ${count}`);
      }
    } else {
      logCheck('fail', 'Database query failed');
    }

  } catch (error) {
    logCheck('fail', `Database connection failed: ${error.message}`);
  }
}

async function checkWebhookEndpoint() {
  console.log('\n🌐 WEBHOOK ENDPOINT ACCESSIBILITY');
  console.log('─'.repeat(70));

  const webhookUrl = 'https://nodejs-1bogy8x99-chris-lanzillis-projects.vercel.app/webhook/retell-call-ended';

  try {
    const response = await axios.post(
      webhookUrl,
      { test: true, verification: 'production-ready-check' },
      { timeout: 10000 }
    );

    if (response.status === 200) {
      logCheck('pass', 'Webhook endpoint is accessible and responding');
      logCheck('pass', `Response: ${JSON.stringify(response.data)}`);
    } else {
      logCheck('warn', `Unexpected status code: ${response.status}`);
    }

  } catch (error) {
    if (error.response) {
      logCheck('warn', `Endpoint responded with: ${error.response.status}`);
    } else {
      logCheck('fail', `Endpoint not accessible: ${error.message}`);
    }
  }
}

async function checkEnvironmentVariables() {
  console.log('\n🔐 ENVIRONMENT VARIABLES');
  console.log('─'.repeat(70));

  const required = [
    'RETELL_API_KEY',
    'ANTHROPIC_API_KEY',
    'POSTGRES_HOST',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DATABASE',
    'JWT_SECRET'
  ];

  for (const envVar of required) {
    if (process.env[envVar]) {
      const value = process.env[envVar];
      const masked = value.substring(0, 8) + '...' + value.slice(-4);
      logCheck('pass', `${envVar}: ${masked}`);
    } else {
      logCheck('fail', `${envVar} is not set!`);
    }
  }
}

async function checkCategoryFile() {
  console.log('\n📋 CATEGORY STORAGE');
  console.log('─'.repeat(70));

  const categoryFile = path.join(__dirname, 'data', 'call_categories.json');

  try {
    const content = await fs.readFile(categoryFile, 'utf-8');
    const categories = JSON.parse(content);
    const count = Object.keys(categories).length;

    logCheck('pass', 'Category file exists and is readable');
    logCheck('pass', `Categorized calls: ${count}`);

    // Check for recent categorizations
    const recent = Object.entries(categories)
      .sort((a, b) => new Date(b[1].categorized_at) - new Date(a[1].categorized_at))
      .slice(0, 3);

    if (recent.length > 0) {
      console.log('\n   Recent categorizations:');
      recent.forEach(([callId, data]) => {
        console.log(`   • ${data.category} - ${new Date(data.categorized_at).toLocaleString()}`);
      });
    }

  } catch (error) {
    logCheck('warn', `Category file issue: ${error.message}`);
  }
}

async function generateReport() {
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    VERIFICATION SUMMARY                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  console.log(`\n✅ Passed: ${CHECKS.passed.length} checks`);
  console.log(`❌ Failed: ${CHECKS.failed.length} checks`);
  console.log(`⚠️  Warnings: ${CHECKS.warnings.length} checks`);

  if (CHECKS.failed.length > 0) {
    console.log('\n❌ CRITICAL ISSUES:');
    CHECKS.failed.forEach(issue => console.log(`   • ${issue}`));
    console.log('\n🚨 System is NOT ready for production!');
    return false;
  }

  if (CHECKS.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    CHECKS.warnings.forEach(warning => console.log(`   • ${warning}`));
  }

  console.log('\n✅ ALL CRITICAL CHECKS PASSED!');
  console.log('\n📊 System Status: READY FOR PRODUCTION');
  console.log('\n🎯 Next Steps:');
  console.log('   1. Monitor incoming calls with: node monitor-webhooks.js');
  console.log('   2. Verify first automated notification is received');
  console.log('   3. When verified, add production contacts to config');
  console.log('   4. Switch mode to "production"');
  console.log('   5. Shut down n8n workflow\n');

  return true;
}

// Run all checks
async function runVerification() {
  try {
    await checkEnvironmentVariables();
    await checkRetellWebhook();
    await checkGoHighLevelConfig();
    await checkDatabaseConnection();
    await checkWebhookEndpoint();
    await checkCategoryFile();

    const ready = await generateReport();
    process.exit(ready ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

runVerification();
