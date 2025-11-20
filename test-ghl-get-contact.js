const axios = require('axios');

const GHL_API_KEY = 'pit-e0730a40-bcf9-43bc-bb39-9fc71668b7d2';
const LOCATION_ID = 'lneM3M1j3P5i0JYeNK18';
const CONTACT_ID = 'Na5Cpmfe7245uXNp3TY2';
const BASE_URL = 'https://services.leadconnectorhq.com';

const headers = {
  'Authorization': `Bearer ${GHL_API_KEY}`,
  'Content-Type': 'application/json',
  'Version': '2021-07-28'
};

async function getContactDetails() {
  try {
    console.log('\n🔍 FETCHING CONTACT DETAILS\n');
    console.log('=' .repeat(80));

    const response = await axios.get(
      `${BASE_URL}/contacts/${CONTACT_ID}`,
      { headers }
    );

    console.log('Contact Details:');
    console.log(JSON.stringify(response.data, null, 2));

    console.log('\n' + '='.repeat(80));
    console.log('\nKey Fields:');
    console.log('- Name:', response.data.contact?.firstName, response.data.contact?.lastName);
    console.log('- Email:', response.data.contact?.email);
    console.log('- Phone:', response.data.contact?.phone);
    console.log('- Contact ID:', response.data.contact?.id);

  } catch (error) {
    console.log('\n❌ ERROR:');
    console.log('Status:', error.response?.status);
    console.log('Error:', JSON.stringify(error.response?.data, null, 2));
  }
}

getContactDetails();
