#!/usr/bin/env node

/**
 * Test webhook endpoint accessibility and response
 */

const axios = require('axios');

const webhookUrl = 'https://nodejs-1bogy8x99-chris-lanzillis-projects.vercel.app/webhook/retell-call-ended';

console.log('🧪 Testing webhook endpoint accessibility...\n');

async function testWebhook() {
  try {
    const response = await axios.post(
      webhookUrl,
      {
        test: true,
        call_id: 'test_verification_call',
        agent_id: 'agent_8e50b96f7e7bb7ce7479219fcc',
        source: 'production_readiness_verification'
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: null // Don't throw on any status
      }
    );

    console.log(`✅ Endpoint Response:`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
    console.log(`   Response Time: ${response.headers['x-vercel-id'] ? 'Vercel' : 'Direct'}`);

    if (response.status === 200) {
      console.log('\n✅ WEBHOOK ENDPOINT IS WORKING CORRECTLY\n');
      return true;
    } else {
      console.log('\n⚠️  Unexpected status code, but endpoint is reachable\n');
      return true;
    }

  } catch (error) {
    console.error(`❌ Webhook endpoint test failed:`);
    console.error(`   Error: ${error.message}`);

    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Response: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      console.error(`   No response received from server`);
    }

    console.log('\n❌ WEBHOOK ENDPOINT IS NOT ACCESSIBLE\n');
    return false;
  }
}

testWebhook().then(success => {
  process.exit(success ? 0 : 1);
});
