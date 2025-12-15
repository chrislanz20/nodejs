// Script to send correction email for 12/9/2025 10:46 AM Insurance call
// Call: call_7d8b50750c13cc0e04cf8056ffd
// Errors: Email had wrong format (geico.claims vs geicoclaims), Claim number missing a zero

require('dotenv').config({ path: '.env.local' });
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
  callId: 'call_7d8b50750c13cc0e04cf8056ffd',
  callTime: 'December 9, 2025 at 10:46 AM',
  callerName: 'Christine DiAngelo',
  company: 'Geico',
  callerPhone: '1-800-841-2920',
  clientName: 'Diana Bernal-Castro',
  // Email correction
  incorrectEmail: 'geico.claims@geico.com',
  correctEmail: 'geicoclaims@geico.com',
  // Claim number correction
  incorrectClaimNumber: '879244236000001',  // 15 digits - missing a zero
  correctClaimNumber: '8792442360000001',   // 16 digits - correct (6 zeros + 1)
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
    .correct-value { font-size: 20px; font-weight: bold; color: #155724; background-color: #d4edda; padding: 10px; border-radius: 5px; text-align: center; margin: 10px 0; }
    .incorrect-value { font-size: 16px; color: #721c24; text-decoration: line-through; }
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
      <h2 style="margin: 0;">⚠️ CORRECTION: Insurance Call - Diana Bernal-Castro</h2>
    </div>
    <div class="content">
      <p>This is a correction to an earlier notification. <strong>Two fields were transcribed incorrectly and need to be updated.</strong></p>

      <div class="correction-box">
        <h3 style="margin-top: 0;">1. Email Address Correction</h3>
        <p style="margin: 0 0 10px 0;"><strong>Previous (Incorrect):</strong></p>
        <p class="incorrect-value">${callDetails.incorrectEmail}</p>

        <p style="margin: 15px 0 10px 0;"><strong>Correct Email:</strong></p>
        <div class="correct-value">${callDetails.correctEmail}</div>
        <p style="font-size: 12px; color: #666; margin: 5px 0 0 0; text-align: center;">(No dot between "geico" and "claims")</p>
      </div>

      <div class="correction-box">
        <h3 style="margin-top: 0;">2. Claim Number Correction</h3>
        <p style="margin: 0 0 10px 0;"><strong>Previous (Incorrect):</strong></p>
        <p class="incorrect-value">${callDetails.incorrectClaimNumber}</p>

        <p style="margin: 15px 0 10px 0;"><strong>Correct Claim Number:</strong></p>
        <div class="correct-value">${callDetails.correctClaimNumber}</div>
        <p style="font-size: 12px; color: #666; margin: 5px 0 0 0; text-align: center;">(16 digits: 879244236 + 0000001 - six zeros then one)</p>
      </div>

      <div class="details">
        <h3>Call Details:</h3>
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
            <td>Callback Phone:</td>
            <td>${callDetails.callerPhone}</td>
          </tr>
          <tr>
            <td>Regarding Client:</td>
            <td>${callDetails.clientName}</td>
          </tr>
        </table>
      </div>

      <p style="margin-top: 20px; font-style: italic; color: #666;">
        Note: These corrections are based on reviewing the original call transcript. The AI transcription system made errors that have been identified and corrected above.
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
  console.log('SUBJECT: ⚠️ CORRECTION: Insurance Call - Diana Bernal-Castro');
  console.log('\nCall Details:');
  console.log('  Caller:', callDetails.callerName, '(' + callDetails.company + ')');
  console.log('  Phone:', callDetails.callerPhone);
  console.log('  Client:', callDetails.clientName);
  console.log('\nCorrections:');
  console.log('  EMAIL:');
  console.log('    INCORRECT:', callDetails.incorrectEmail);
  console.log('    CORRECT:  ', callDetails.correctEmail);
  console.log('  CLAIM NUMBER:');
  console.log('    INCORRECT:', callDetails.incorrectClaimNumber, '(15 digits)');
  console.log('    CORRECT:  ', callDetails.correctClaimNumber, '(16 digits)');
  console.log('\n---');
  console.log('\nTo send this email, run with --send flag:');
  console.log('  node send-correction-12-9-insurance.js --send\n');

  if (process.argv.includes('--send')) {
    console.log('Sending correction email...');

    try {
      const result = await resend.emails.send({
        from: 'CourtLaw AI <notifications@saveyatech.com>',
        to: recipients,
        subject: '⚠️ CORRECTION: Insurance Call - Diana Bernal-Castro (Geico)',
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
