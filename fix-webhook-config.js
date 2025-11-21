// Fix Retell Agent Webhook Configuration
const Retell = require('retell-sdk');
require('dotenv').config();

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

const AGENT_ID = 'agent_8e50b96f7e7bb7ce7479219fcc';
const WEBHOOK_URL = 'https://nodejs-theta-woad.vercel.app/webhook/retell-call-ended';

async function fixWebhook() {
  console.log('🔧 Fixing webhook configuration...\n');

  try {
    // Get current agent config
    const agent = await client.agent.retrieve(AGENT_ID);
    console.log('Current configuration:');
    console.log(`  webhook_url: ${agent.webhook_url || 'NOT SET'}`);
    console.log(`  end_call_webhook: ${agent.end_call_webhook || 'NOT SET'}`);

    // Update agent with end_call_webhook
    console.log('\nUpdating agent configuration...');
    const updated = await client.agent.update(AGENT_ID, {
      end_call_webhook: WEBHOOK_URL
    });

    console.log('\n✅ Updated configuration:');
    console.log(`  webhook_url: ${updated.webhook_url || 'NOT SET'}`);
    console.log(`  end_call_webhook: ${updated.end_call_webhook || 'NOT SET'}`);

    console.log('\n🎉 Webhook configuration fixed!');
    console.log('Future calls will now trigger the webhook properly.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

fixWebhook();
