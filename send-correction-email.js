// Script to send correction email for claim number error
// Call: call_9a4c145b0e059950f25324b749c
// The caller called back with the correct claim number

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

// Call details
const callDetails = {
  callId: 'call_9a4c145b0e059950f25324b749c',
  callTime: 'December 4, 2025 at 1:54 PM',
  callerName: 'Nicole Sergeant',
  company: 'Tycho',
  callerPhone: '856-355-7983',
  clientNames: 'Elder Haywood and Melissa Mustafa',
  incorrectClaimNumber: '876212776000002',  // 15 digits - missing a zero
  correctClaimNumber: '8762127760000002',   // 16 digits - correct
};

const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #dc3545; color: white; padding: 15px; border-radius: 5px 5px 0 0; }
    .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
    .correction-box { background-color: #fff3cd; border: 2px solid #ffc107; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .correct-number { font-size: 24px; font-weight: bold; color: #155724; background-color: #d4edda; padding: 10px; border-radius: 5px; text-align: center; margin: 10px 0; }
    .incorrect-number { font-size: 18px; color: #721c24; text-decoration: line-through; }
    .details { margin-top: 20px; }
    .details table { width: 100%; border-collapse: collapse; }
    .details td { padding: 8px; border-bottom: 1px solid #dee2e6; }
    .details td:first-child { font-weight: bold; width: 40%; }
    .footer { font-size: 12px; color: #6c757d; margin-top: 20px; padding-top: 15px; border-top: 1px solid #dee2e6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">⚠️ CORRECTION: Claim Number Update</h2>
    </div>
    <div class="content">
      <p>This is a correction to an earlier notification. <strong>The caller called back to provide the correct claim number.</strong></p>

      <div class="correction-box">
        <p style="margin: 0 0 10px 0;"><strong>Previous (Incorrect) Claim Number:</strong></p>
        <p class="incorrect-number">${callDetails.incorrectClaimNumber}</p>

        <p style="margin: 15px 0 10px 0;"><strong>Correct Claim Number:</strong></p>
        <div class="correct-number">${callDetails.correctClaimNumber}</div>
        <p style="font-size: 12px; color: #666; margin: 5px 0 0 0; text-align: center;">(16 digits: 8762127760000002)</p>
      </div>

      <div class="details">
        <h3>Original Call Details:</h3>
        <table>
          <tr>
            <td>Call Time:</td>
            <td>${callDetails.callTime}</td>
          </tr>
          <tr>
            <td>Caller:</td>
            <td>${callDetails.callerName}</td>
          </tr>
          <tr>
            <td>Company:</td>
            <td>${callDetails.company}</td>
          </tr>
          <tr>
            <td>Phone:</td>
            <td>${callDetails.callerPhone}</td>
          </tr>
          <tr>
            <td>Regarding Client(s):</td>
            <td>${callDetails.clientNames}</td>
          </tr>
        </table>
      </div>

      <p style="margin-top: 20px; font-style: italic; color: #666;">
        Note: The original claim number was transcribed incorrectly during the call. The caller has since called back to confirm the correct number shown above.
      </p>
    </div>
    <div class="footer">
      <p>This correction was sent by the CourtLaw AI Phone System.</p>
      <p>Call ID: ${callDetails.callId}</p>
    </div>
  </div>
</body>
</html>
`;

async function sendCorrectionEmail() {
  console.log('=== CORRECTION EMAIL PREVIEW ===\n');
  console.log('TO:', recipients.join(', '));
  console.log('SUBJECT: ⚠️ CORRECTION: Claim Number for Elder Haywood / Melissa Mustafa');
  console.log('\nCall Details:');
  console.log('  Caller:', callDetails.callerName, '(' + callDetails.company + ')');
  console.log('  Phone:', callDetails.callerPhone);
  console.log('  Client:', callDetails.clientNames);
  console.log('\nClaim Number Correction:');
  console.log('  INCORRECT:', callDetails.incorrectClaimNumber, '(15 digits - was missing a zero)');
  console.log('  CORRECT:  ', callDetails.correctClaimNumber, '(16 digits)');
  console.log('\n---');
  console.log('\nTo send this email, run with --send flag:');
  console.log('  node send-correction-email.js --send\n');

  if (process.argv.includes('--send')) {
    console.log('Sending correction email...');

    try {
      const result = await resend.emails.send({
        from: 'CourtLaw AI <notifications@saveyatech.com>',
        to: recipients,
        subject: '⚠️ CORRECTION: Claim Number for Elder Haywood / Melissa Mustafa',
        html: emailHtml,
      });

      console.log('✅ Email sent successfully!');
      console.log('Email ID:', result.data?.id);
    } catch (error) {
      console.error('❌ Error sending email:', error.message);
    }
  }
}

sendCorrectionEmail();
