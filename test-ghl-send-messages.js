const axios = require('axios');

const GHL_API_KEY = 'pit-e0730a40-bcf9-43bc-bb39-9fc71668b7d2';
const LOCATION_ID = 'lneM3M1j3P5i0JYeNK18';
const CONTACT_ID = 'Na5Cpmfe7245uXNp3TY2'; // Chris's existing contact
const BASE_URL = 'https://services.leadconnectorhq.com';

const headers = {
  'Authorization': `Bearer ${GHL_API_KEY}`,
  'Content-Type': 'application/json',
  'Version': '2021-07-28'
};

async function testSendMessages() {
  try {
    console.log('\n🚀 TESTING GOHIGHLEVEL MESSAGING API\n');
    console.log('=' .repeat(80));
    console.log('Contact ID:', CONTACT_ID);
    console.log('Location ID:', LOCATION_ID);

    // STEP 1: Send Email
    console.log('\n📧 STEP 1: Sending HTML email...');

    try {
      const emailResponse = await axios.post(
        `${BASE_URL}/conversations/messages`,
        {
          type: 'Email',
          locationId: LOCATION_ID,
          contactId: CONTACT_ID,
          subject: 'Test: Inbound Call Alert — New Client Lead',
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inbound Call Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white;">
    <!-- Header -->
    <div style="background-color: #1a1a1a; color: white; padding: 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px;">Inbound Call Alert — New Client Lead</h1>
    </div>

    <!-- Summary Banner -->
    <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
      <p style="margin: 0; font-size: 16px;"><strong>Call Summary:</strong> New potential client regarding car accident case</p>
    </div>

    <!-- Caller Details -->
    <div style="padding: 30px;">
      <h2 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">Caller Details</h2>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <tr>
          <td style="padding: 10px; background-color: #f9f9f9; font-weight: bold; width: 40%;">Name:</td>
          <td style="padding: 10px; background-color: #f9f9f9;">Chris Lanzilli (TEST)</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold;">Phone (Verbally Stated):</td>
          <td style="padding: 10px;">781-475-7191</td>
        </tr>
        <tr>
          <td style="padding: 10px; background-color: #f9f9f9; font-weight: bold;">Inbound Phone Number:</td>
          <td style="padding: 10px; background-color: #f9f9f9;">+1 (201) 862-4576</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold;">Email:</td>
          <td style="padding: 10px;">17lanzch@gmail.com</td>
        </tr>
        <tr>
          <td style="padding: 10px; background-color: #f9f9f9; font-weight: bold;">Incident Description:</td>
          <td style="padding: 10px; background-color: #f9f9f9;">Testing the GoHighLevel API direct email sending capability for the CourtLaw system migration from N8N.</td>
        </tr>
      </table>

      <!-- Action Buttons -->
      <div style="margin-top: 30px; text-align: center;">
        <a href="tel:+17814757191" style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 0 10px;">📞 Call Now</a>
        <a href="mailto:17lanzch@gmail.com" style="display: inline-block; background-color: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 0 10px;">✉️ Send Email</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f5f5f5; padding: 20px; text-align: center; color: #666; font-size: 12px;">
      <p style="margin: 0;">This is an automated notification from the CourtLaw call handling system.</p>
      <p style="margin: 5px 0 0 0;">Powered by Retell AI + Node.js + GoHighLevel</p>
    </div>
  </div>
</body>
</html>
          `
        },
        { headers }
      );

      console.log('✅ EMAIL SENT SUCCESSFULLY!');
      console.log('Response:', JSON.stringify(emailResponse.data, null, 2));
    } catch (emailError) {
      console.log('❌ Email sending failed:');
      console.log('Status:', emailError.response?.status);
      console.log('Error:', JSON.stringify(emailError.response?.data, null, 2));
    }

    // STEP 2: Send SMS
    console.log('\n' + '-'.repeat(80));
    console.log('\n📱 STEP 2: Sending SMS...');

    try {
      const smsResponse = await axios.post(
        `${BASE_URL}/conversations/messages`,
        {
          type: 'SMS',
          locationId: LOCATION_ID,
          contactId: CONTACT_ID,
          message: `New Inbound Lead

Name: Chris Lanzilli (TEST)
Phone Number: 781-475-7191
Email: 17lanzch@gmail.com
Summary: Testing GoHighLevel API for CourtLaw N8N migration`
        },
        { headers }
      );

      console.log('✅ SMS SENT SUCCESSFULLY!');
      console.log('Response:', JSON.stringify(smsResponse.data, null, 2));
    } catch (smsError) {
      console.log('❌ SMS sending failed:');
      console.log('Status:', smsError.response?.status);
      console.log('Error:', JSON.stringify(smsError.response?.data, null, 2));
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ MESSAGING TEST COMPLETE\n');

  } catch (error) {
    console.log('\n❌ UNEXPECTED ERROR:');
    console.log(error.message);
    if (error.response) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testSendMessages();
