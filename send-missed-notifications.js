// Script to send missed notification emails for calls after 11:59 AM
// Medical (12:18 PM), Attorney (12:28 PM), Existing Client (12:34 PM)
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// All recipients including Chris
const RECIPIENTS = [
  { name: 'Chris Lanzilli', email: '17lanzch@gmail.com' },
  { name: 'Yuly Arzadi', email: 'info@courtlaw.com' },
  { name: 'Maggie Cruz', email: 'mcruz@courtlaw.com' },
  { name: 'Ernest Blair', email: 'eblair@courtlaw.com' },
  { name: 'Ana Estivenson', email: 'aestivenson@courtlaw.com' },
  { name: 'Michele Labrada', email: 'mlabrada@courtlaw.com' },
  { name: 'Karim Arzadi', email: 'karzadi@courtlaw.com' },
  { name: 'Stephanie Vasquez', email: 'svasquez@courtlaw.com' }
];

// ============ MEDICAL CALL (12:18:56 PM) ============
const medicalData = {
  Name: 'Joanna',
  Phone: '732-641-3620',
  InboundPhoneNum: '+17326413620',
  Email: 'terthamboy@logospt.com',
  Claim: 'Not provided',
  representing_who: 'What Was Physical Therapy',
  client_name: 'Francisca Beras',
  Purpose: 'Joanna, a medical provider from What Was Physical Therapy, called to request a Letter of Protection (LOP) for patient Francisca Beras. The agent successfully collected all necessary information including the patient name, contact phone number (732-641-3362), and email address (terthamboy@logospt.com), and confirmed the request would be forwarded to the attorney for follow-up.'
};

const medicalHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Inbound Call – Medical Professional</title></head>
<body style="margin:0; padding:0; background-color:#f4f6f8;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f6f8;">
<tr><td align="center" style="padding:24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e6e9ec;">
<tr><td style="padding:20px 24px; background:#131313; color:#ffffff; font-family:Arial, Helvetica, sans-serif;">
<div style="font-size:18px; font-weight:bold;">Inbound Call Alert — Medical Professional</div>
<div style="font-size:12px; opacity:0.9; margin-top:6px;">Personal Injury Intake • Action Required</div>
</td></tr>
<tr><td style="padding:16px 24px; background:#fff7e6; border-bottom:1px solid #f0ead9; font-family:Arial, Helvetica, sans-serif;">
<div style="font-size:14px; color:#6b5b02;"><strong>Urgent:</strong> ${medicalData.Purpose}</div>
</td></tr>
<tr><td style="padding:20px 24px; font-family:Arial, Helvetica, sans-serif; color:#111;">
<div style="font-size:16px; font-weight:bold; margin-bottom:12px;">Caller Details</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:14px;">
<tr><td style="padding:6px 0; width:160px; color:#555;">Name</td><td style="padding:6px 0;"><strong>${medicalData.Name}</strong></td></tr>
<tr><td style="padding:6px 0; color:#555;">Verbally Stated Phone</td><td style="padding:6px 0;"><a href="tel:${medicalData.Phone}" style="color:#0b6efd; text-decoration:none;">${medicalData.Phone}</a></td></tr>
<tr><td style="padding:6px 0; color:#555;">Inbound Phone</td><td style="padding:6px 0;"><a href="tel:${medicalData.InboundPhoneNum}" style="color:#0b6efd; text-decoration:none;">${medicalData.InboundPhoneNum}</a></td></tr>
<tr><td style="padding:6px 0; color:#555;">Email</td><td style="padding:6px 0;"><a href="mailto:${medicalData.Email}" style="color:#0b6efd; text-decoration:none;">${medicalData.Email}</a></td></tr>
<tr><td style="padding:6px 0; color:#555;">Claim Number</td><td style="padding:6px 0;">${medicalData.Claim}</td></tr>
<tr><td style="padding:6px 0; color:#555;">Who Representing</td><td style="padding:6px 0;">${medicalData.representing_who}</td></tr>
<tr><td style="padding:6px 0; color:#555;">Client Name</td><td style="padding:6px 0;">${medicalData.client_name}</td></tr>
<tr><td style="padding:6px 0; color:#555; vertical-align:top;">Purpose</td><td style="padding:6px 0;">${medicalData.Purpose}</td></tr>
</table>
</td></tr>
<tr><td style="padding:0 24px 12px 24px; font-family:Arial, Helvetica, sans-serif;">
<div style="height:1px; background:#edf0f2; margin:0 0 16px 0;"></div>
<div style="font-size:16px; font-weight:bold; margin-bottom:12px; color:#111;">Patient / Case Snapshot</div>
</td></tr>
<tr><td align="center" style="padding:8px 24px 24px 24px; font-family:Arial, Helvetica, sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 6px 8px 0;"><a href="tel:${medicalData.Phone}" style="display:inline-block; padding:12px 18px; background:#0b6efd; color:#ffffff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:bold;">Call ${medicalData.Phone}</a></td>
<td style="padding:0 0 8px 6px;"><a href="mailto:${medicalData.Email}" style="display:inline-block; padding:12px 18px; background:#198754; color:#ffffff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:bold;">Email ${medicalData.Email}</a></td></tr>
</table>
<div style="font-size:12px; color:#666; margin-top:6px;">Tip: Reply to confirm receipt and provide ETA.</div>
</td></tr>
<tr><td style="padding:14px 24px 20px 24px; font-family:Arial, Helvetica, sans-serif; background:#fafbfc; border-top:1px solid #edf0f2; color:#6b7280; font-size:12px;">
This alert was generated automatically by the intake system for CourtLaw. If you believe you received it in error, please contact the intake admin.
</td></tr>
</table>
<div style="font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#98a2b3; margin-top:12px;">© CourtLaw</div>
</td></tr></table></body></html>`;

// ============ ATTORNEY CALL (12:28:12 PM) ============
const attorneyData = {
  Name: 'Brett Wilson',
  Phone: '484-823-XXXX',
  InboundPhoneNum: '+12155692800',
  Email: 'Not provided',
  WhoRepresenting: 'Zarwin Baum',
  CaseName: 'Philippe France',
  ClaimNum: 'Not provided',
  Purpose: 'Brett Wilson, an attorney from Zarwin Baum law firm, called to speak with the attorney responsible for his client Philippe France\'s case. The agent collected Brett\'s contact information and confirmed details about the case and the attorney Ernest Blair who handles it.'
};

const attorneyHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Inbound Call – Attorney</title></head>
<body style="margin:0; padding:0; background-color:#f4f6f8;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f6f8;">
<tr><td align="center" style="padding:24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e6e9ec;">
<tr><td style="padding:20px 24px; background:#131313; color:#ffffff; font-family:Arial, Helvetica, sans-serif;">
<div style="font-size:18px; font-weight:bold;">Inbound Call Alert — Attorney</div>
<div style="font-size:12px; opacity:0.9; margin-top:6px;">Personal Injury Intake • Action Required</div>
</td></tr>
<tr><td style="padding:16px 24px; background:#fff7e6; border-bottom:1px solid #f0ead9; font-family:Arial, Helvetica, sans-serif;">
<div style="font-size:14px; color:#6b5b02;"><strong>Urgent:</strong> ${attorneyData.Purpose}</div>
</td></tr>
<tr><td style="padding:20px 24px; font-family:Arial, Helvetica, sans-serif; color:#111;">
<div style="font-size:16px; font-weight:bold; margin-bottom:12px;">Caller Details</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:14px;">
<tr><td style="padding:6px 0; width:160px; color:#555;">Name</td><td style="padding:6px 0;"><strong>${attorneyData.Name}</strong></td></tr>
<tr><td style="padding:6px 0; color:#555;">Verbally Stated Phone</td><td style="padding:6px 0;"><a href="tel:${attorneyData.Phone}" style="color:#0b6efd; text-decoration:none;">${attorneyData.Phone}</a></td></tr>
<tr><td style="padding:6px 0; color:#555;">Inbound Phone</td><td style="padding:6px 0;"><a href="tel:${attorneyData.InboundPhoneNum}" style="color:#0b6efd; text-decoration:none;">${attorneyData.InboundPhoneNum}</a></td></tr>
<tr><td style="padding:6px 0; color:#555;">Email</td><td style="padding:6px 0;">${attorneyData.Email}</td></tr>
<tr><td style="padding:6px 0; color:#555; vertical-align:top;">Who Representing</td><td style="padding:6px 0;">${attorneyData.WhoRepresenting}</td></tr>
<tr><td style="padding:6px 0; color:#555; vertical-align:top;">Case Name</td><td style="padding:6px 0;">${attorneyData.CaseName}</td></tr>
<tr><td style="padding:6px 0; color:#555; vertical-align:top;">Claim Number</td><td style="padding:6px 0;">${attorneyData.ClaimNum}</td></tr>
<tr><td style="padding:6px 0; color:#555; vertical-align:top;">Purpose</td><td style="padding:6px 0;">${attorneyData.Purpose}</td></tr>
</table>
</td></tr>
<tr><td style="padding:0 24px 12px 24px; font-family:Arial, Helvetica, sans-serif;">
<div style="height:1px; background:#edf0f2; margin:0 0 16px 0;"></div>
<div style="font-size:16px; font-weight:bold; margin-bottom:12px; color:#111;">Patient / Case Snapshot</div>
</td></tr>
<tr><td align="center" style="padding:8px 24px 24px 24px; font-family:Arial, Helvetica, sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 6px 8px 0;"><a href="tel:${attorneyData.InboundPhoneNum}" style="display:inline-block; padding:12px 18px; background:#0b6efd; color:#ffffff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:bold;">Call ${attorneyData.InboundPhoneNum}</a></td></tr>
</table>
<div style="font-size:12px; color:#666; margin-top:6px;">Tip: Reply to confirm receipt and provide ETA.</div>
</td></tr>
<tr><td style="padding:14px 24px 20px 24px; font-family:Arial, Helvetica, sans-serif; background:#fafbfc; border-top:1px solid #edf0f2; color:#6b7280; font-size:12px;">
This alert was generated automatically by the intake system for CourtLaw. If you believe you received it in error, please contact the intake admin.
</td></tr>
</table>
<div style="font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#98a2b3; margin-top:12px;">© CourtLaw</div>
</td></tr></table></body></html>`;

// ============ EXISTING CLIENT CALL (12:34:29 PM) ============
const existingClientData = {
  Name: 'Parker',
  Phone: '201-551-7121',
  InboundPhoneNum: '+12015517121',
  Email: 'Not provided',
  representing_who: 'Not provided',
  client_name: 'Not provided',
  claim_num: 'Not provided',
  Purpose: 'Parker called CourtLaw to reach attorney Karim Malzadi. The agent Maria took a callback request and collected Parker\'s phone number (201-551-7121) to have Karim return the call.'
};

const existingClientHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Inbound Call – Existing Client</title></head>
<body style="margin:0; padding:0; background-color:#f4f6f8;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f6f8;">
<tr><td align="center" style="padding:24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e6e9ec;">
<tr><td style="padding:20px 24px; background:#131313; color:#ffffff; font-family:Arial, Helvetica, sans-serif;">
<div style="font-size:18px; font-weight:bold;">Inbound Call Alert — Existing Client</div>
<div style="font-size:12px; opacity:0.9; margin-top:6px;">Personal Injury Intake • Action Required</div>
</td></tr>
<tr><td style="padding:16px 24px; background:#fff7e6; border-bottom:1px solid #f0ead9; font-family:Arial, Helvetica, sans-serif;">
<div style="font-size:14px; color:#6b5b02;"><strong>Urgent:</strong> ${existingClientData.Purpose}</div>
</td></tr>
<tr><td style="padding:20px 24px; font-family:Arial, Helvetica, sans-serif; color:#111;">
<div style="font-size:16px; font-weight:bold; margin-bottom:12px;">Caller Details</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:14px;">
<tr><td style="padding:6px 0; width:160px; color:#555;">Name</td><td style="padding:6px 0;"><strong>${existingClientData.Name}</strong></td></tr>
<tr><td style="padding:6px 0; color:#555;">Verbally Stated Phone</td><td style="padding:6px 0;"><a href="tel:${existingClientData.Phone}" style="color:#0b6efd; text-decoration:none;">${existingClientData.Phone}</a></td></tr>
<tr><td style="padding:6px 0; color:#555;">Inbound Phone</td><td style="padding:6px 0;"><a href="tel:${existingClientData.InboundPhoneNum}" style="color:#0b6efd; text-decoration:none;">${existingClientData.InboundPhoneNum}</a></td></tr>
<tr><td style="padding:6px 0; color:#555;">Email</td><td style="padding:6px 0;">${existingClientData.Email}</td></tr>
<tr><td style="padding:6px 0; color:#555; vertical-align:top;">Purpose</td><td style="padding:6px 0;">${existingClientData.Purpose}</td></tr>
<tr><td style="padding:6px 0; color:#555; vertical-align:top;">Who Representing</td><td style="padding:6px 0;">${existingClientData.representing_who}</td></tr>
<tr><td style="padding:6px 0; color:#555; vertical-align:top;">Client Name</td><td style="padding:6px 0;">${existingClientData.client_name}</td></tr>
<tr><td style="padding:6px 0; color:#555; vertical-align:top;">Claim Number</td><td style="padding:6px 0;">${existingClientData.claim_num}</td></tr>
</table>
</td></tr>
<tr><td style="padding:0 24px 12px 24px; font-family:Arial, Helvetica, sans-serif;">
<div style="height:1px; background:#edf0f2; margin:0 0 16px 0;"></div>
<div style="font-size:16px; font-weight:bold; margin-bottom:12px; color:#111;">Patient / Case Snapshot</div>
</td></tr>
<tr><td align="center" style="padding:8px 24px 24px 24px; font-family:Arial, Helvetica, sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 6px 8px 0;"><a href="tel:${existingClientData.Phone}" style="display:inline-block; padding:12px 18px; background:#0b6efd; color:#ffffff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:bold;">Call ${existingClientData.Phone}</a></td></tr>
</table>
<div style="font-size:12px; color:#666; margin-top:6px;">Tip: Reply to confirm receipt and provide ETA.</div>
</td></tr>
<tr><td style="padding:14px 24px 20px 24px; font-family:Arial, Helvetica, sans-serif; background:#fafbfc; border-top:1px solid #edf0f2; color:#6b7280; font-size:12px;">
This alert was generated automatically by the intake system for CourtLaw. If you believe you received it in error, please contact the intake admin.
</td></tr>
</table>
<div style="font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#98a2b3; margin-top:12px;">© CourtLaw</div>
</td></tr></table></body></html>`;

// All emails to send
const EMAILS = [
  {
    subject: 'Inbound Call Alert — Medical Professional (Dec 2, 12:18 PM)',
    html: medicalHtml,
    category: 'Medical'
  },
  {
    subject: 'Inbound Call Alert — Attorney (Dec 2, 12:28 PM)',
    html: attorneyHtml,
    category: 'Attorney'
  },
  {
    subject: 'Inbound Call Alert — Call from Existing Client (Dec 2, 12:34 PM)',
    html: existingClientHtml,
    category: 'Existing Client'
  }
];

async function sendAllEmails() {
  console.log('='.repeat(70));
  console.log('SENDING MISSED NOTIFICATION EMAILS');
  console.log('='.repeat(70));
  console.log(`\nSending ${EMAILS.length} notification types to ${RECIPIENTS.length} recipients each`);
  console.log(`Total emails: ${EMAILS.length * RECIPIENTS.length}\n`);

  if (process.env.SEND_EMAILS !== 'true') {
    console.log('EMAILS TO SEND:');
    EMAILS.forEach(e => console.log(`  - ${e.subject}`));
    console.log('\nRECIPIENTS:');
    RECIPIENTS.forEach(r => console.log(`  - ${r.name} <${r.email}>`));
    console.log('\n⚠️  DRY RUN MODE - No emails sent.');
    console.log('To send emails, run with: SEND_EMAILS=true');
    return;
  }

  let totalSent = 0;
  let totalFailed = 0;

  for (const email of EMAILS) {
    console.log(`\n📧 Sending ${email.category} notifications...`);

    for (const recipient of RECIPIENTS) {
      try {
        const { data, error } = await resend.emails.send({
          from: 'SaveYa Tech Notifications <notifications@saveyatech.com>',
          to: recipient.email,
          subject: email.subject,
          html: email.html
        });

        if (error) {
          console.error(`  ❌ ${recipient.name}: ${error.message}`);
          totalFailed++;
        } else {
          console.log(`  ✅ ${recipient.name}`);
          totalSent++;
        }
      } catch (err) {
        console.error(`  ❌ ${recipient.name}: ${err.message}`);
        totalFailed++;
      }

      // Wait 500ms between sends to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`COMPLETE: ${totalSent} sent, ${totalFailed} failed`);
  console.log('='.repeat(70));
}

sendAllEmails();
