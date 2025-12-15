// Test the last name detection logic
require('dotenv').config();
const callerCRM = require('./lib/callerCRM');

async function test() {
  console.log('Testing last name detection for Jimmy...\n');

  // Jimmy's phone number
  const phoneNumber = '17325068855';
  const agentId = 'agent_8e50b96f7e7bb7ce7479219fcc';

  const context = await callerCRM.getCallerContext(phoneNumber, agentId);

  console.log('Caller Context:');
  console.log('  isKnownCaller:', context.isKnownCaller);
  console.log('  callerType:', context.callerType);
  console.log('  name on file:', context.profile?.name);
  console.log('');
  console.log('  fieldsToConfirm:', JSON.stringify(context.fieldsToConfirm, null, 2));
  console.log('  fieldsToAsk:', context.fieldsToAsk);
  console.log('');

  if (context.fieldsToAsk && context.fieldsToAsk.some(f => f.includes('last name'))) {
    console.log('✅ SUCCESS: System detected that last name is needed!');
  } else {
    console.log('❌ FAIL: Last name not detected as needed');
  }

  process.exit(0);
}

test();
