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
 * Filters out: wrong numbers, hangups, spam, calls with no meaningful info
 * Keeps: legitimate business inquiries, vendors, job applicants, insurance reps
 */
function shouldSendOtherEmail(callData) {
  const reason = callData.reason_for_calling || callData.purpose || '';
  const name = callData.caller_name || callData.name || '';
  const phone = callData.phone || '';

  // Must have at least a reason for calling
  if (!reason || reason.trim().length < 10) {
    console.log(`   ⏭️  Skipping "Other" email: reason too short or empty`);
    return false;
  }

  // Filter out common non-actionable calls
  const reasonLower = reason.toLowerCase();
  const skipKeywords = [
    'wrong number',
    'misdial',
    'hung up',
    'hang up',
    'no answer',
    'spam',
    'telemarketer',
    'robocall',
    'not interested',
    'unrelated',
    'personal call'
  ];

  for (const keyword of skipKeywords) {
    if (reasonLower.includes(keyword)) {
      console.log(`   ⏭️  Skipping "Other" email: contains "${keyword}"`);
      return false;
    }
  }

  // If we have name AND reason, it's likely legitimate
  if (name && name.length > 2 && reason.length > 15) {
    console.log(`   ✅ Sending "Other" email: has name and substantive reason`);
    return true;
  }

  // Default: send if reason is substantive (>20 chars)
  if (reason.length >= 20) {
    console.log(`   ✅ Sending "Other" email: substantive reason provided`);
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
  console.log(`📝 Generated email: "${emailData.subject}"`);< /antml:parameter>
</invoke>

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
