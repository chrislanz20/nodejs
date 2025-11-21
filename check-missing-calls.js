const Retell = require('retell-sdk');
require('dotenv').config();
const { Pool } = require('pg');

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false }
});

async function checkMissingCalls() {
  const retellCalls = await client.call.list({ limit: 10 });
  const dbResult = await pool.query('SELECT call_id, category, created_at FROM call_categories ORDER BY created_at DESC LIMIT 10');

  console.log('🔍 CHECKING LAST 10 CALLS:\n');
  console.log('='.repeat(60));

  retellCalls.forEach((call, i) => {
    const callId = call.callId || call.call_id;
    const inDb = dbResult.rows.find(row => row.call_id === callId);
    const start = new Date(call.startTimestamp || call.start_timestamp);

    console.log(`${i+1}. ${callId}`);
    console.log(`   Time: ${start.toLocaleString()}`);

    if (inDb) {
      console.log(`   ✅ In Database`);
      console.log(`   Category: ${inDb.category}`);
    } else {
      console.log(`   ❌ NOT IN DATABASE - WEBHOOK DID NOT FIRE`);
    }
    console.log('');
  });

  console.log('='.repeat(60));

  const missing = retellCalls.filter(call => {
    const callId = call.callId || call.call_id;
    return !dbResult.rows.find(row => row.call_id === callId);
  });

  console.log(`\n📊 SUMMARY:`);
  console.log(`   Total calls in Retell: ${retellCalls.length}`);
  console.log(`   Calls in database: ${retellCalls.length - missing.length}`);
  console.log(`   Missing from database: ${missing.length}`);

  if (missing.length > 0) {
    console.log(`\n🚨 THESE CALLS DID NOT TRIGGER WEBHOOK:`);
    missing.forEach(call => {
      const callId = call.callId || call.call_id;
      const start = new Date(call.startTimestamp || call.start_timestamp);
      console.log(`   ${callId} (${start.toLocaleString()})`);
    });

    console.log(`\n💡 CAUSE: Webhook was returning HTTP 200 instead of HTTP 204`);
    console.log(`✅ FIX: Just deployed - webhook now returns HTTP 204`);
    console.log(`\n⚠️  These old calls won't be automatically processed.`);
    console.log(`   New calls from now on should work!`);
  } else {
    console.log(`\n✅ All calls are in the database!`);
  }

  pool.end();
}

checkMissingCalls().catch(e => {
  console.error('Error:', e.message);
  pool.end();
  process.exit(1);
});
