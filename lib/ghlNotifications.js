// GoHighLevel Notifications Module
// Handles sending emails and SMS via GoHighLevel API

const axios = require('axios');
const { getClientConfig, getGHLContactIds } = require('../config/clients');
const { generateEmail, generateSMS } = require('./emailTemplates');

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

/**
 * Send email via GoHighLevel API to a single contact
 */
async function sendEmailToContact(locationId, apiKey, contactId, subject, htmlContent) {
  try {
    const response = await axios.post(
      `${GHL_BASE_URL}/conversations/messages`,
      {
        type: 'Email',
        locationId: locationId,
        contactId: contactId,
        subject: subject,
        html: htmlContent
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Version': GHL_API_VERSION
        }
      }
    );

    return {
      success: true,
      messageId: response.data.messageId,
      contactId: contactId
    };
  } catch (error) {
    console.error(`❌ Failed to send email to contact ${contactId}:`, error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
      contactId: contactId
    };
  }
}

/**
 * Send SMS via GoHighLevel API to a single contact
 */
async function sendSMSToContact(locationId, apiKey, contactId, message) {
  try {
    const response = await axios.post(
      `${GHL_BASE_URL}/conversations/messages`,
      {
        type: 'SMS',
        locationId: locationId,
        contactId: contactId,
        message: message
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Version': GHL_API_VERSION
        }
      }
    );

    return {
      success: true,
      messageId: response.data.messageId,
      contactId: contactId
    };
  } catch (error) {
    console.error(`❌ Failed to send SMS to contact ${contactId}:`, error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
      contactId: contactId
    };
  }
}

/**
 * Determine if an "Other" caller email should be sent
 * Filters out: hangups, very short calls, calls with no meaningful content
 * Keeps: any call with a name + contact method + reason (be loose - don't miss anything)
 */
function shouldSendOtherEmail(callData) {
  const summary = callData.call_summary || callData.purpose || callData.reason_for_calling || '';
  const name = callData.caller_name || callData.name || '';
  const phone = callData.phone || callData.from_number || '';
  const email = callData.email || '';
  const callDuration = callData.duration_seconds || callData.call_duration || 0;

  // Log what we're checking
  console.log(`   📋 Checking "Other" filter - Name: "${name}", Duration: ${callDuration}s, Summary length: ${summary.length}`);

  // ALWAYS SEND if caller mentions specific staff names (like Karim, Maggie, etc.)
  const summaryLower = summary.toLowerCase();
  const staffNames = ['karim', 'kareem', 'maggie', 'cruz'];
  for (const staffName of staffNames) {
    if (summaryLower.includes(staffName)) {
      console.log(`   ✅ Sending "Other" email: mentions staff member "${staffName}"`);
      return true;
    }
  }

  // SKIP: Very short calls (under 30 seconds) - likely hangups
  if (callDuration > 0 && callDuration < 30) {
    console.log(`   ⏭️  Skipping "Other" email: call too short (${callDuration}s < 30s)`);
    return false;
  }

  // SKIP: No summary or very short summary (greeting only)
  if (!summary || summary.trim().length < 30) {
    console.log(`   ⏭️  Skipping "Other" email: summary too short or empty`);
    return false;
  }

  // SKIP: Summary indicates no actionable content
  const skipPatterns = [
    /only.*greeted/i,
    /asked.*language.*preference/i,
    /no.*transcript/i,
    /caller.*hung.*up/i,
    /wrong.*number/i,
    /misdial/i,
    /no.*response/i,
    /silence/i,
    /test.*call/i
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(summary)) {
      console.log(`   ⏭️  Skipping "Other" email: summary matches skip pattern`);
      return false;
    }
  }

  // SEND: Has contact info (phone or email) AND has some purpose
  const hasContact = (phone && phone.length > 5) || (email && email.includes('@'));
  if (hasContact && summary.length >= 30) {
    console.log(`   ✅ Sending "Other" email: has contact info and substantive summary`);
    return true;
  }

  // SEND: Has name AND has substantive summary (even without phone/email - we have caller ID)
  if (name && name.length > 2 && name.toLowerCase() !== 'unknown' && summary.length >= 50) {
    console.log(`   ✅ Sending "Other" email: has name and detailed summary`);
    return true;
  }

  // SEND: Long summary indicates meaningful conversation
  if (summary.length >= 100) {
    console.log(`   ✅ Sending "Other" email: detailed summary (${summary.length} chars)`);
    return true;
  }

  console.log(`   ⏭️  Skipping "Other" email: insufficient information`);
  return false;
}

/**
 * Send notifications for a call
 * @param {string} agentId - Retell agent ID to identify the client
 * @param {string} category - Call category (New Lead, Attorney, etc.)
 * @param {object} callData - Call data including transcript, caller info, etc.
 */
async function sendNotifications(agentId, category, callData) {
  console.log(`\n📧 Sending notifications for ${category} call (Agent: ${agentId.substring(0, 20)}...)`);

  // FILTER: Skip "Other" calls that aren't actionable
  if (category === 'Other') {
    if (!shouldSendOtherEmail(callData)) {
      console.log(`❌ Skipping notification for "Other" call - filtered out`);
      return {
        success: true,
        filtered: true,
        reason: 'Other call did not meet criteria for notification',
        category: category
      };
    }
  }

  // Get client configuration
  const config = getClientConfig(agentId);
  if (!config) {
    console.error(`❌ No configuration found for agent: ${agentId}`);
    return { success: false, error: 'No client configuration found' };
  }

  const results = {
    client: config.client_name,
    category: category,
    mode: config.mode,
    emails_sent: [],
    sms_sent: [],
    errors: []
  };

  // Generate email content
  const emailData = generateEmail(category, callData);
  console.log(`📝 Generated email: "${emailData.subject}"`);

  // Get contact IDs for this client
  const contactIds = getGHLContactIds(agentId);
  console.log(`👥 Sending to ${contactIds.length} contact(s) in ${config.mode} mode`);

  // Send emails to all contacts
  for (const contactId of contactIds) {
    const result = await sendEmailToContact(
      config.ghl_location_id,
      config.ghl_api_key,
      contactId,
      emailData.subject,
      emailData.html
    );

    if (result.success) {
      console.log(`✅ Email sent to contact ${contactId}: ${result.messageId}`);
      results.emails_sent.push(result);
    } else {
      console.error(`❌ Email failed for contact ${contactId}`);
      results.errors.push(result);
    }
  }

  // Send SMS only for New Leads
  if (category === 'New Lead') {
    console.log(`📱 Generating SMS for New Lead...`);
    const smsMessage = generateSMS(callData);

    for (const contactId of contactIds) {
      const result = await sendSMSToContact(
        config.ghl_location_id,
        config.ghl_api_key,
        contactId,
        smsMessage
      );

      if (result.success) {
        console.log(`✅ SMS sent to contact ${contactId}: ${result.messageId}`);
        results.sms_sent.push(result);
      } else {
        console.error(`❌ SMS failed for contact ${contactId}`);
        results.errors.push(result);
      }
    }
  } else {
    console.log(`ℹ️  No SMS sent (category: ${category} - SMS only sent for New Leads)`);
  }

  // Summary
  console.log(`\n📊 Notification Summary for ${config.client_name}:`);
  console.log(`   - Emails sent: ${results.emails_sent.length}`);
  console.log(`   - SMS sent: ${results.sms_sent.length}`);
  console.log(`   - Errors: ${results.errors.length}`);

  return results;
}

module.exports = {
  sendNotifications,
  sendEmailToContact,
  sendSMSToContact
};
