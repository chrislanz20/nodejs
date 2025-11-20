const axios = require('axios');

async function testGHLEmailAPI() {
  try {
    console.log('\n📧 TESTING GOHIGHLEVEL EMAIL API\n');
    console.log('=' .repeat(80));

    const response = await axios.post(
      'https://services.leadconnectorhq.com/conversations/messages',
      {
        type: 'Email',
        locationId: 'lneM3M1j3P5i0JYeNK18',
        contactId: 'test_contact_123',
        subject: 'Test Email from GoHighLevel API',
        html: '<h1>Test Email</h1><p>This is a test email sent via GoHighLevel direct messaging API.</p>',
        emailTo: ['chris@saveyatech.com']
      },
      {
        headers: {
          'Authorization': 'Bearer pit-e0730a40-bcf9-43bc-bb39-9fc71668b7d2',
          'Content-Type': 'application/json',
          'Version': '2021-07-28'
        }
      }
    );

    console.log('\n✅ SUCCESS! Email API Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.log('\n❌ ERROR:');
    console.log('Status:', error.response?.status);
    console.log('Status Text:', error.response?.statusText);
    console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
    console.log('Error Message:', error.message);
    console.log('\n' + '='.repeat(80));
  }
}

testGHLEmailAPI();
