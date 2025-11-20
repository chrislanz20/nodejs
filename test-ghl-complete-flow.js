const axios = require('axios');

const GHL_API_KEY = 'pit-e0730a40-bcf9-43bc-bb39-9fc71668b7d2';
const LOCATION_ID = 'lneM3M1j3P5i0JYeNK18';
const BASE_URL = 'https://services.leadconnectorhq.com';

const headers = {
  'Authorization': `Bearer ${GHL_API_KEY}`,
  'Content-Type': 'application/json',
  'Version': '2021-07-28'
};

async function testCompleteGHLFlow() {
  try {
    console.log('\n🚀 TESTING COMPLETE GOHIGHLEVEL FLOW\n');
    console.log('=' .repeat(80));

    // STEP 1: Create a contact
    console.log('\n📝 STEP 1: Creating contact...');

    const contactData = {
      firstName: 'Chris',
      lastName: 'Test',
      email: '17lanzch@gmail.com',
      phone: '+17814757191',
      locationId: LOCATION_ID,
      source: 'Retell AI Call'
    };

    let contactId;
    try {
      const createResponse = await axios.post(
        `${BASE_URL}/contacts/`,
        contactData,
        { headers }
      );

      contactId = createResponse.data.contact?.id || createResponse.data.id;
      console.log('✅ Contact created successfully!');
      console.log('Contact ID:', contactId);
      console.log('Response:', JSON.stringify(createResponse.data, null, 2));
    } catch (createError) {
      console.log('❌ Contact creation failed:', createError.response?.data || createError.message);

      // If contact already exists, try to find it
      if (createError.response?.status === 422 || createError.response?.status === 400) {
        console.log('\n🔍 Contact might already exist. Trying to find existing contact...');

        try {
          const searchResponse = await axios.get(
            `${BASE_URL}/contacts/?locationId=${LOCATION_ID}&email=17lanzch@gmail.com`,
            { headers }
          );

          if (searchResponse.data.contacts && searchResponse.data.contacts.length > 0) {
            contactId = searchResponse.data.contacts[0].id;
            console.log('✅ Found existing contact!');
            console.log('Contact ID:', contactId);
          }
        } catch (searchError) {
          console.log('❌ Search failed:', searchError.response?.data || searchError.message);
        }
      }
    }

    if (!contactId) {
      console.log('\n❌ Cannot proceed without a valid contact ID');
      return;
    }

    // STEP 2: Send Email
    console.log('\n' + '-'.repeat(80));
    console.log('\n📧 STEP 2: Sending email...');

    try {
      const emailResponse = await axios.post(
        `${BASE_URL}/conversations/messages`,
        {
          type: 'Email',
          locationId: LOCATION_ID,
          contactId: contactId,
          subject: 'Test Email from CourtLaw System',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background-color: #1a1a1a; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">Inbound Call Alert — Test</h1>
              </div>
              <div style="padding: 20px; background-color: #f5f5f5;">
                <h2 style="color: #333;">Test Email from GoHighLevel API</h2>
                <p>This is a test email sent via the GoHighLevel messaging API.</p>
                <p><strong>From:</strong> Chris Test<br>
                <strong>Email:</strong> 17lanzch@gmail.com<br>
                <strong>Phone:</strong> +17814757191</p>
              </div>
            </div>
          `
        },
        { headers }
      );

      console.log('✅ Email sent successfully!');
      console.log('Response:', JSON.stringify(emailResponse.data, null, 2));
    } catch (emailError) {
      console.log('❌ Email sending failed:');
      console.log('Status:', emailError.response?.status);
      console.log('Error:', JSON.stringify(emailError.response?.data, null, 2));
    }

    // STEP 3: Send SMS
    console.log('\n' + '-'.repeat(80));
    console.log('\n📱 STEP 3: Sending SMS...');

    try {
      const smsResponse = await axios.post(
        `${BASE_URL}/conversations/messages`,
        {
          type: 'SMS',
          locationId: LOCATION_ID,
          contactId: contactId,
          message: 'Test SMS from CourtLaw system. This is a test of the GoHighLevel API direct messaging.'
        },
        { headers }
      );

      console.log('✅ SMS sent successfully!');
      console.log('Response:', JSON.stringify(smsResponse.data, null, 2));
    } catch (smsError) {
      console.log('❌ SMS sending failed:');
      console.log('Status:', smsError.response?.status);
      console.log('Error:', JSON.stringify(smsError.response?.data, null, 2));
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ COMPLETE FLOW TEST FINISHED\n');

  } catch (error) {
    console.log('\n❌ UNEXPECTED ERROR:');
    console.log(error.message);
    if (error.response) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testCompleteGHLFlow();
