const Retell = require('retell-sdk');
require('dotenv').config();

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

async function checkWebhookConfig() {
  const agents = await client.agent.list();

  console.log('🔍 RETELL AGENT WEBHOOK CONFIGURATION:\n');
  console.log('='.repeat(70));

  const uniqueAgents = {};
  agents.forEach(agent => {
    const id = agent.agentId || agent.agent_id;
    if (!uniqueAgents[id]) {
      uniqueAgents[id] = agent;
    }
  });

  Object.values(uniqueAgents).forEach((agent, i) => {
    console.log(`${i+1}. ${agent.agentName || agent.agent_name}`);
    console.log(`   ID: ${agent.agentId || agent.agent_id}`);
    console.log(`   Webhook: ${agent.webhookUrl || agent.webhook_url || 'NOT SET'}`);
    console.log('');
  });

  console.log('='.repeat(70));
  console.log('\n✅ Expected webhook URL:');
  console.log('https://nodejs-theta-woad.vercel.app/webhook/retell-call-ended');
}

checkWebhookConfig().catch(e => {
  console.error('Error:', e.message);
});
