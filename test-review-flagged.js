// Review the 8 flagged calls to verify extraction accuracy
require('dotenv').config();
const Retell = require('retell-sdk').default;
const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

const flaggedCalls = [
  { callId: 'call_c1ad025d3a6d5ae4c2080ad24fa', extracted: '1548809221', flag: 'No clear confirmation pattern' },
  { callId: 'call_f58bd1f130b2a2f9899cefd7424', extracted: '0441266900101021', flag: 'No clear confirmation pattern' },
  { callId: 'call_1cb6123a3e1071e99a20ce75bfe', extracted: '3214600001', flag: 'Caller said no but we extracted' },
  { callId: 'call_f7b4ddbfe33a35460271b5f45cb', extracted: '3050H398H', flag: 'No clear confirmation pattern' },
  { callId: 'call_a029667e5ffba3001596d418d60', extracted: '781475ME', flag: 'No clear confirmation pattern' },
  { callId: 'call_bfbf048e4c6a6a91ed3ccc105be', extracted: '126229331', flag: 'No clear confirmation pattern' },
  { callId: 'call_9bb688e31abcf47c243224b11b6', extracted: '126229331', flag: 'No clear confirmation pattern' },
  { callId: 'call_52700ddeb063aef3d5c411f3080', extracted: '7322487700176', flag: 'No clear confirmation pattern' },
];

async function reviewCalls() {
  for (const item of flaggedCalls) {
    const call = await retellClient.call.retrieve(item.callId);

    console.log('\n' + '='.repeat(100));
    console.log(`CALL: ${item.callId}`);
    console.log(`EXTRACTED: ${item.extracted}`);
    console.log(`FLAG: ${item.flag}`);
    console.log('='.repeat(100));

    console.log('\nFULL TRANSCRIPT:');
    for (let i = 0; i < call.transcript_object.length; i++) {
      const msg = call.transcript_object[i];
      const prefix = msg.role === 'agent' ? '🤖' : '👤';
      console.log(`[${i}] ${prefix} ${msg.role.toUpperCase()}: ${msg.content}`);
    }

    console.log('\n' + '-'.repeat(100));
    console.log(`VERIFY: Is "${item.extracted}" the correct claim number from this call?`);
    console.log('-'.repeat(100));
  }
}

reviewCalls().catch(console.error);
