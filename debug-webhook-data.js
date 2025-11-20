// Debug script to see what data we're getting from Retell webhook
// This will help us understand why fields are missing

const { Retell } = require('retell-sdk');
require('dotenv').config();

const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

// Use a recent call ID from your system
const CALL_ID = 'REPLACE_WITH_RECENT_CALL_ID'; // Replace with the Carolynn Mulder call ID

async function debugCallData() {
  try {
    console.log('🔍 Fetching call data from Retell...\n');

    const fullCall = await retellClient.call.retrieve(CALL_ID);

    console.log('📋 FULL CALL OBJECT:');
    console.log(JSON.stringify(fullCall, null, 2));

    console.log('\n\n🎯 EXTRACTED DATA SPECIFICALLY:');
    console.log(JSON.stringify(fullCall.extracted_data, null, 2));

    console.log('\n\n📞 CALL ANALYSIS:');
    console.log(JSON.stringify(fullCall.call_analysis, null, 2));

    console.log('\n\n💬 TRANSCRIPT EXCERPT (first 500 chars):');
    const transcript = fullCall.transcript_object || fullCall.transcript || [];
    if (Array.isArray(transcript)) {
      transcript.slice(0, 5).forEach((msg, i) => {
        console.log(`${i + 1}. ${msg.role}: ${msg.content}`);
      });
    }

    console.log('\n\n🔎 FIELDS WE NEED:');
    console.log(`   Name: ${fullCall.extracted_data?.name || fullCall.extracted_data?.contact_name || 'NOT FOUND'}`);
    console.log(`   Email: ${fullCall.extracted_data?.email || fullCall.extracted_data?.email_address || 'NOT FOUND'}`);
    console.log(`   Who Representing: ${fullCall.extracted_data?.who_representing || fullCall.extracted_data?.representing_who || 'NOT FOUND'}`);
    console.log(`   Case Name: ${fullCall.extracted_data?.case_name || fullCall.extracted_data?.client_name || 'NOT FOUND'}`);
    console.log(`   Purpose: ${fullCall.extracted_data?.purpose || fullCall.call_analysis?.call_summary || 'NOT FOUND'}`);
    console.log(`   Claim Number: ${fullCall.extracted_data?.claim_num || fullCall.extracted_data?.claim_number || 'NOT FOUND'}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

debugCallData();
