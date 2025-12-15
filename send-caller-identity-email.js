// Script to send notification about caller identity
// The person who called as an uncooperative "New Lead" is actually a medical provider

require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Recipients - active recipients from notification_recipients table
const recipients = [
  'mcruz@courtlaw.com',       // Maggie Cruz
  'karzadi@courtlaw.com',     // Karim Arzadi
  '17lanzch@gmail.com',       // Chris Lanzilli
  'info@courtlaw.com',        // Yuly Arzadi
  'svasquez@courtlaw.com',    // Stephanie Vasquez
  'aestivenson@courtlaw.com', // Ana Estivenson
  'mlabrada@courtlaw.com'     // Michele Labrada
];

const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #17a2b8; color: white; padding: 15px; border-radius: 5px 5px 0 0; }
    .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
    .info-box { background-color: #d1ecf1; border: 2px solid #17a2b8; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .caller-info { background-color: #d4edda; border: 1px solid #28a745; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .details table { width: 100%; border-collapse: collapse; }
    .details td { padding: 8px; border-bottom: 1px solid #dee2e6; }
    .details td:first-child { font-weight: bold; width: 40%; }
    .footer { font-size: 12px; color: #6c757d; margin-top: 20px; padding-top: 15px; border-top: 1px solid #dee2e6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">ℹ️ Caller Identity Update</h2>
    </div>
    <div class="content">
      <p>You may have received a notification about an uncooperative caller who refused to provide their information:</p>

      <div class="info-box">
        <p style="margin: 0;"><strong>Original notification said:</strong></p>
        <p style="font-style: italic; margin: 10px 0 0 0;">"The user called CourtLaw as a new potential client injured in an accident in New Jersey but refused to provide details or their full name, insisting on speaking directly with a human agent."</p>
      </div>

      <p><strong>We have identified this caller.</strong> They called back later and provided their information:</p>

      <div class="caller-info">
        <h3 style="margin-top: 0; color: #155724;">Caller Identity:</h3>
        <table class="details">
          <tr>
            <td>Name:</td>
            <td><strong>Tina T.</strong></td>
          </tr>
          <tr>
            <td>Company:</td>
            <td><strong>IGEA Brain and Spine</strong> (Medical Provider)</td>
          </tr>
          <tr>
            <td>Phone:</td>
            <td>908-688-8800 ext 134</td>
          </tr>
          <tr>
            <td>Email:</td>
            <td>pip-wc@iganeuro.com</td>
          </tr>
          <tr>
            <td>Calling About:</td>
            <td><strong>Eva Smith</strong> (CourtLaw client)</td>
          </tr>
          <tr>
            <td>Claim Number:</td>
            <td>2595065931 0</td>
          </tr>
          <tr>
            <td>Request:</td>
            <td>Needs documents: declaration page, police report, PIP ledger, and health insurance card</td>
          </tr>
        </table>
      </div>

      <p style="margin-top: 20px;">This was <strong>not</strong> a new potential client - it was a medical provider calling about an existing client who initially did not want to provide their information to the AI.</p>

    </div>
    <div class="footer">
      <p>This update was sent by the CourtLaw AI Phone System.</p>
      <p>Phone: +19086888800</p>
    </div>
  </div>
</body>
</html>
`;

async function sendEmail() {
  console.log('=== CALLER IDENTITY EMAIL PREVIEW ===\n');
  console.log('TO:', recipients.join(', '));
  console.log('SUBJECT: ℹ️ Caller Identity Update: Uncooperative caller was Tina T. from IGEA Brain and Spine');
  console.log('\nThis email explains that the "uncooperative new lead" from 908-688-8800');
  console.log('is actually Tina T. from IGEA Brain and Spine calling about client Eva Smith.');
  console.log('\n---');
  console.log('\nTo send this email, run with --send flag:');
  console.log('  node send-caller-identity-email.js --send\n');

  if (process.argv.includes('--send')) {
    console.log('Sending email...');

    try {
      const result = await resend.emails.send({
        from: 'CourtLaw AI <notifications@saveyatech.com>',
        to: recipients,
        subject: 'ℹ️ Caller Identity Update: Uncooperative caller was Tina T. from IGEA Brain and Spine',
        html: emailHtml,
      });

      console.log('✅ Email sent successfully!');
      console.log('Email ID:', result.data?.id);
    } catch (error) {
      console.error('❌ Error sending email:', error.message);
    }
  }
}

sendEmail();
