// Comprehensive Notification Diagnostic Script
require('dotenv').config();
const { Pool } = require('pg');
const { sendNotifications } = require('./lib/ghlNotifications');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false }
});

async function diagnoseNotifications() {
  console.log('🔍 NOTIFICATION DIAGNOSTIC REPORT\n');
  console.log('=' .repeat(60));

  // 1. Check recent Medical calls
  console.log('\n1️⃣  RECENT MEDICAL CATEGORIZED CALLS:');
  const medicalCalls = await pool.query(`
    SELECT call_id, category, created_at
    FROM call_categories
    WHERE category = 'Medical'
    AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT 5
  `);

  if (medicalCalls.rows.length === 0) {
    console.log('   ❌ No Medical calls found in last 24 hours');
  } else {
    medicalCalls.rows.forEach(row => {
      console.log(`   ✅ ${row.call_id} at ${row.created_at}`);
    });
  }

  // 2. Check all categories in last 2 hours
  console.log('\n2️⃣  ALL CALLS IN LAST 2 HOURS:');
  const recentCalls = await pool.query(`
    SELECT call_id, category, created_at
    FROM call_categories
    WHERE created_at > NOW() - INTERVAL '2 hours'
    ORDER BY created_at DESC
  `);

  if (recentCalls.rows.length === 0) {
    console.log('   ℹ️  No calls in last 2 hours');
  } else {
    recentCalls.rows.forEach(row => {
      console.log(`   📞 ${row.call_id} → ${row.category} (${row.created_at})`);
    });
  }

  // 3. Test notification sending for Medical category
  console.log('\n3️⃣  TESTING MEDICAL NOTIFICATION:');
  const testCallData = {
    phone: '+17814757191',
    phone_number: '+17814757191',
    from_number: '+15551234567',
    name: 'Dr. Test Medical',
    email: 'doctor@test.com',
    claim_number: 'CLAIM-12345',
    representing_who: 'Patient John Doe',
    client_name: 'John Doe',
    purpose: 'Calling about medical billing for patient case'
  };

  console.log('   Sending test Medical notification...');
  try {
    const result = await sendNotifications(
      'agent_8e50b96f7e7bb7ce7479219fcc',
      'Medical',
      testCallData
    );
    console.log('\n   ✅ NOTIFICATION RESULT:');
    console.log(`      Emails sent: ${result.emails_sent?.length || 0}`);
    console.log(`      SMS sent: ${result.sms_sent?.length || 0}`);
    console.log(`      Errors: ${result.errors?.length || 0}`);

    if (result.emails_sent && result.emails_sent.length > 0) {
      console.log('\n   📧 Email Details:');
      result.emails_sent.forEach(email => {
        console.log(`      ✓ Sent to contact: ${email.contactId}`);
        console.log(`        Message ID: ${email.messageId}`);
      });
    }

    if (result.errors && result.errors.length > 0) {
      console.log('\n   ❌ Errors:');
      result.errors.forEach(error => {
        console.log(`      Error: ${JSON.stringify(error.error)}`);
      });
    }
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    console.error(error);
  }

  // 4. Check GoHighLevel contact configuration
  console.log('\n4️⃣  GOHIGHLEVEL CONFIGURATION:');
  const { getClientConfig, getGHLContactIds } = require('./config/clients');
  const config = getClientConfig('agent_8e50b96f7e7bb7ce7479219fcc');
  console.log(`   Client: ${config.client_name}`);
  console.log(`   Mode: ${config.mode}`);
  console.log(`   Contact IDs: ${getGHLContactIds('agent_8e50b96f7e7bb7ce7479219fcc').join(', ')}`);
  console.log(`   Location ID: ${config.ghl_location_id}`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Diagnostic complete!\n');

  pool.end();
  process.exit(0);
}

diagnoseNotifications().catch(error => {
  console.error('❌ Diagnostic failed:', error);
  pool.end();
  process.exit(1);
});
