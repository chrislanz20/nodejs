// Script to send apology email to CourtLaw team about claim number correction
const { Resend } = require('resend');

// Resend API
const resend = new Resend(process.env.RESEND_API_KEY);

// CourtLaw Insurance notification recipients (from config/clients.js)
const COURTLAW_INSURANCE_RECIPIENTS = [
  { name: 'CourtLaw Info', email: 'info@courtlaw.com' },
  { name: 'Karim Arzadi', email: 'Karzadi@courtlaw.com' },
  { name: 'Chris Lanzilli', email: 'chris@saveyatech.com' },
  { name: 'Matt', email: 'matt@saveyatech.com' },
  { name: 'S. Vasquez', email: 'svasquez@courtlaw.com' },
  { name: 'M. Labrada', email: 'mlabrada@courtlaw.com' },
  { name: 'M. Cruz', email: 'mcruz@courtlaw.com' },
  { name: 'E. Blair', email: 'eblair@courtlaw.com' },
  { name: 'A. Estivenson', email: 'aestivenson@courtlaw.com' }
];

async function sendApologyEmail() {
  try {
    const recipients = COURTLAW_INSURANCE_RECIPIENTS;
    console.log(`Found ${recipients.length} recipients for insurance notifications:`);
    recipients.forEach(r => console.log(`  - ${r.name}: ${r.email}`));

    if (recipients.length === 0) {
      console.log('No recipients found. Exiting.');
      process.exit(1);
    }

    // Email content
    const subject = 'RE: Inbound Call Alert — Insurance | Correction Notice';

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #0b6efd; padding: 16px 20px; margin-bottom: 24px;">
    <strong style="color: #0b6efd;">System Update Notice</strong>
  </div>

  <p>Dear CourtLaw Team,</p>

  <p>We wanted to follow up regarding the recent insurance call notification from <strong>Attorney Moz Mamalik (Liberty Mutual)</strong>.</p>

  <p>Upon review, we identified that the file number in the original notification contained a minor data entry discrepancy. Please note the following correction:</p>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr>
      <td style="padding: 10px; background: #fff3f3; border: 1px solid #ddd;"><strong>Originally Reported:</strong></td>
      <td style="padding: 10px; background: #fff3f3; border: 1px solid #ddd; font-family: monospace;">LA359052582130000005</td>
    </tr>
    <tr>
      <td style="padding: 10px; background: #f0fff0; border: 1px solid #ddd;"><strong>Corrected File Number:</strong></td>
      <td style="padding: 10px; background: #f0fff0; border: 1px solid #ddd; font-family: monospace;"><strong>LA3590525821300005</strong></td>
    </tr>
  </table>

  <p>This discrepancy was caused by a brief processing issue in our intake system, which has since been identified and resolved. We have implemented enhanced validation protocols to ensure accurate data capture going forward.</p>

  <p>We apologize for any inconvenience this may have caused. If you have already reached out to the caller using the previous file number, we recommend confirming the corrected number during your follow-up.</p>

  <p>Please don't hesitate to reach out if you have any questions.</p>

  <p style="margin-top: 30px;">
    Best regards,<br>
    <strong>SaveYa Tech Support Team</strong>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="font-size: 12px; color: #888;">
    This is an automated correction notice from the CourtLaw intake system.
    For technical support, please contact your system administrator.
  </p>
</body>
</html>
`;

    // DRY RUN - Show what would be sent
    console.log('\n' + '='.repeat(70));
    console.log('EMAIL PREVIEW (DRY RUN - NOT SENDING YET)');
    console.log('='.repeat(70));
    console.log(`\nSUBJECT: ${subject}\n`);
    console.log('RECIPIENTS:');
    recipients.forEach(r => console.log(`  • ${r.name} <${r.email}>`));
    console.log('\nEMAIL BODY (Plain text version):');
    console.log('-'.repeat(70));

    // Convert HTML to readable text for preview
    const textPreview = `
Dear CourtLaw Team,

We wanted to follow up regarding the recent insurance call notification
from Attorney Moz Mamalik (Liberty Mutual).

Upon review, we identified that the file number in the original
notification contained a minor data entry discrepancy. Please note
the following correction:

  Originally Reported:    LA359052582130000005
  Corrected File Number:  LA3590525821300005

This discrepancy was caused by a brief processing issue in our intake
system, which has since been identified and resolved. We have implemented
enhanced validation protocols to ensure accurate data capture going forward.

We apologize for any inconvenience this may have caused. If you have
already reached out to the caller using the previous file number, we
recommend confirming the corrected number during your follow-up.

Please don't hesitate to reach out if you have any questions.

Best regards,
SaveYa Tech Support Team
`;
    console.log(textPreview);
    console.log('-'.repeat(70));
    console.log('\n⚠️  DRY RUN MODE - No emails sent.');
    console.log('To send emails, set SEND_EMAILS=true environment variable.\n');

    // Only send if explicitly enabled
    if (process.env.SEND_EMAILS === 'true') {
      console.log('📧 SENDING EMAILS...\n');

      // Skip already sent (info@courtlaw.com and Karzadi@courtlaw.com)
      const alreadySent = ['info@courtlaw.com', 'karzadi@courtlaw.com'];
      const remainingRecipients = recipients.filter(r =>
        !alreadySent.includes(r.email.toLowerCase())
      );

      console.log(`Skipping ${alreadySent.length} already sent. Sending to ${remainingRecipients.length} remaining...\n`);

      for (const recipient of remainingRecipients) {
        console.log(`Sending to ${recipient.name} (${recipient.email})...`);

        try {
          const { data, error } = await resend.emails.send({
            from: 'CourtLaw Intake System <notifications@saveyatech.com>',
            to: recipient.email,
            subject: subject,
            html: htmlBody
          });

          if (error) {
            console.error(`  ❌ Failed: ${error.message}`);
          } else {
            console.log(`  ✅ Sent successfully (ID: ${data?.id})`);
          }
        } catch (emailError) {
          console.error(`  ❌ Error: ${emailError.message}`);
        }

        // Wait 600ms between sends to avoid rate limiting (2 req/sec limit)
        await new Promise(resolve => setTimeout(resolve, 600));
      }
      console.log('\n✅ Apology emails sent to all recipients.');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

sendApologyEmail();
