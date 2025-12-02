// Script to forward the Existing Client email to the rest of the firm
// (Chris already received it at 17lanzch@gmail.com)
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Recipients who should have received the email but had notifications turned off
const RECIPIENTS = [
  { name: 'Yuly Arzadi', email: 'info@courtlaw.com' },
  { name: 'Maggie Cruz', email: 'mcruz@courtlaw.com' },
  { name: 'Ernest Blair', email: 'eblair@courtlaw.com' },
  { name: 'Ana Estivenson', email: 'aestivenson@courtlaw.com' },
  { name: 'Michele Labrada', email: 'mlabrada@courtlaw.com' },
  { name: 'Karim Arzadi', email: 'karzadi@courtlaw.com' },
  { name: 'Stephanie Vasquez', email: 'svasquez@courtlaw.com' }
];

// Call data from the Existing Client call at 11:59:32 AM
const callData = {
  Name: 'Miguelita Rodríguez',
  Phone: '+13479424729',
  InboundPhoneNum: '+13479424729',
  Email: 'Not provided',
  Purpose: 'Miguelita Rodríguez called CourtLaw with questions about why she needs to sign a check and whether she must go to the office. Agent Maria collected her information and arranged for attorney Karim to call her back to clarify the details of the check signing and her case.',
  representing_who: 'Not provided',
  client_name: 'Not provided',
  claim_num: 'Not provided'
};

// Generate the HTML email (same format as the system sends)
const htmlEmail = `<!-- Personal Injury Inbound Call Notification (Existing Client) -->
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/199/xhtml">
  <head>
    <meta charset="utf-8">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Inbound Call – Existing Client</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f6f8;">
    <!-- Preheader (hidden in most clients) -->
    <div style="display:none; font-size:1px; color:#f4f6f8; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f6f8;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e6e9ec;">
            <!-- Header -->
            <tr>
              <td style="padding:20px 24px; background:#131313; color:#ffffff; font-family:Arial, Helvetica, sans-serif;">
                <div style="font-size:18px; font-weight:bold;">Inbound Call Alert — Existing Client</div>
                <div style="font-size:12px; opacity:0.9; margin-top:6px;">Personal Injury Intake • Action Required</div>
              </td>
            </tr>

            <!-- Summary Banner -->
            <tr>
              <td style="padding:16px 24px; background:#fff7e6; border-bottom:1px solid #f0ead9; font-family:Arial, Helvetica, sans-serif;">
                <div style="font-size:14px; color:#6b5b02;">
                  <strong>Urgent:</strong> ${callData.Purpose}</strong>.
                </div>
              </td>
            </tr>

            <!-- Caller Details -->
            <tr>
              <td style="padding:20px 24px; font-family:Arial, Helvetica, sans-serif; color:#111;">
                <div style="font-size:16px; font-weight:bold; margin-bottom:12px;">Caller Details</div>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:14px;">
                  <tr>
                    <td style="padding:6px 0; width:160px; color:#555;">Name</td>
                    <td style="padding:6px 0;"><strong>${callData.Name}</strong></td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0; color:#555;">Verbally Stated Phone</td>
                    <td style="padding:6px 0;">
                      <a href="tel:${callData.Phone}" style="color:#0b6efd; text-decoration:none;">${callData.Phone}</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0; color:#555;">Inbound Phone</td>
                    <td style="padding:6px 0;">
                      <a href="tel:${callData.InboundPhoneNum}" style="color:#0b6efd; text-decoration:none;">${callData.InboundPhoneNum}</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0; color:#555;">Email</td>
                    <td style="padding:6px 0;">
                      <a href="mailto:${callData.Email}?subject=Regarding%20John%20Smith%20PI%20case" style="color:#0b6efd; text-decoration:none;">${callData.Email}</a>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:6px 0; color:#555; vertical-align:top;">Purpose</td>
                    <td style="padding:6px 0;">
                      ${callData.Purpose}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0; color:#555; vertical-align:top;">Who Representing</td>
                    <td style="padding:6px 0;">
                      ${callData.representing_who}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0; color:#555; vertical-align:top;">Client Name</td>
                    <td style="padding:6px 0;">
                      ${callData.client_name}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0; color:#555; vertical-align:top;">Claim Number</td>
                    <td style="padding:6px 0;">
                      ${callData.claim_num}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Patient/Case Snapshot -->
            <tr>
              <td style="padding:0 24px 12px 24px; font-family:Arial, Helvetica, sans-serif;">
                <div style="height:1px; background:#edf0f2; margin:0 0 16px 0;"></div>
                <div style="font-size:16px; font-weight:bold; margin-bottom:12px; color:#111;">Patient / Case Snapshot</div>
              </td>
            </tr>

            <!-- CTA Buttons -->
            <tr>
              <td align="center" style="padding:8px 24px 24px 24px; font-family:Arial, Helvetica, sans-serif;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:0 6px 8px 0;">
                      <a href="tel:${callData.Phone}"
                         style="display:inline-block; padding:12px 18px; background:#0b6efd; color:#ffffff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:bold;">
                        Call ${callData.Phone}
                      </a>
                    </td>
                  </tr>
                </table>
                <div style="font-size:12px; color:#666; margin-top:6px;">
                  Tip: Reply to confirm receipt and provide ETA.
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:14px 24px 20px 24px; font-family:Arial, Helvetica, sans-serif; background:#fafbfc; border-top:1px solid #edf0f2; color:#6b7280; font-size:12px;">
                This alert was generated automatically by the intake system for CourtLaw.
                If you believe you received it in error, please contact the intake admin.
              </td>
            </tr>
          </table>

          <!-- Small footer brand line -->
          <div style="font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#98a2b3; margin-top:12px;">
            © CourtLaw
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

async function sendEmails() {
  const subject = 'Inbound Call Alert — Call from Existing Client (Dec 2, 11:59 AM)';

  console.log('='.repeat(70));
  console.log('EXISTING CLIENT EMAIL FORWARD');
  console.log('='.repeat(70));
  console.log(`\nCall Time: 12/2/2025, 11:59:32 AM`);
  console.log(`Caller: ${callData.Name}`);
  console.log(`Phone: ${callData.Phone}`);
  console.log(`\nSending to ${RECIPIENTS.length} recipients...`);
  RECIPIENTS.forEach(r => console.log(`  - ${r.name} <${r.email}>`));

  if (process.env.SEND_EMAILS !== 'true') {
    console.log('\n⚠️  DRY RUN MODE - No emails sent.');
    console.log('To send emails, run with: SEND_EMAILS=true');
    return;
  }

  console.log('\n📧 SENDING EMAILS...\n');

  for (const recipient of RECIPIENTS) {
    console.log(`Sending to ${recipient.name} (${recipient.email})...`);

    try {
      const { data, error } = await resend.emails.send({
        from: 'SaveYa Tech Notifications <notifications@saveyatech.com>',
        to: recipient.email,
        subject: subject,
        html: htmlEmail
      });

      if (error) {
        console.error(`  ❌ Failed: ${error.message}`);
      } else {
        console.log(`  ✅ Sent successfully (ID: ${data?.id})`);
      }
    } catch (emailError) {
      console.error(`  ❌ Error: ${emailError.message}`);
    }

    // Wait 600ms between sends to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 600));
  }

  console.log('\n✅ Emails sent to all recipients.');
}

sendEmails();
