// GoHighLevel Notifications Module
// Handles sending emails and SMS via GoHighLevel API

const axios = require('axios');
const { getClientConfig, getGHLContactIds } = require('../config/clients');
const { generateEmail, generateSMS } = require('./emailTemplates');

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Check if error is retryable (transient network/server errors)
 */
function isRetryableError(error) {
  // Network errors (socket hang up, connection reset, timeout)
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }
  // Socket hang up
  if (error.message && error.message.includes('socket hang up')) {
    return true;
  }
  // Server errors (5xx)
  if (error.response && error.response.status >= 500) {
    return true;
  }
  // Rate limiting (429)
  if (error.response && error.response.status === 429) {
    return true;
  }
  return false;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send email via GoHighLevel API to a single contact (with retry)
 */
async function sendEmailToContact(locationId, apiKey, contactId, subject, htmlContent) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
          },
          timeout: 30000 // 30 second timeout
        }
      );

      return {
        success: true,
        messageId: response.data.messageId,
        contactId: contactId
      };
    } catch (error) {
      lastError = error;

      if (isRetryableError(error) && attempt < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.log(`   ⚠️ Email attempt ${attempt} failed (${error.message}), retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        break;
      }
    }
  }

  console.error(`❌ Failed to send email to contact ${contactId} after ${MAX_RETRIES} attempts:`, lastError.response?.data || lastError.message);
  return {
    success: false,
    error: lastError.response?.data || lastError.message,
    contactId: contactId
  };
}

/**
 * Send SMS via GoHighLevel API to a single contact (with retry)
 */
async function sendSMSToContact(locationId, apiKey, contactId, message) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
          },
          timeout: 30000 // 30 second timeout
        }
      );

      return {
        success: true,
        messageId: response.data.messageId,
        contactId: contactId
      };
    } catch (error) {
      lastError = error;

      if (isRetryableError(error) && attempt < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.log(`   ⚠️ SMS attempt ${attempt} failed (${error.message}), retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        break;
      }
    }
  }

  console.error(`❌ Failed to send SMS to contact ${contactId} after ${MAX_RETRIES} attempts:`, lastError.response?.data || lastError.message);
  return {
    success: false,
    error: lastError.response?.data || lastError.message,
    contactId: contactId
  };
}

/**
 * Determine if an "Other" caller email should be sent using AI
 * Uses Claude to evaluate if the call has a legitimate, actionable purpose
 * Filters out: hangups, wrong numbers, no response, test calls, etc.
 */
async function shouldSendOtherEmail(callData) {
  const summary = callData.call_summary || callData.purpose || callData.reason_for_calling || '';
  const name = callData.caller_name || callData.name || '';
  const callDuration = callData.duration_seconds || callData.call_duration || 0;

  // Log what we're checking
  console.log(`   📋 Checking "Other" filter - Name: "${name}", Duration: ${callDuration}s`);

  // ALWAYS SEND if caller mentions specific staff names (like Karim, Maggie, etc.)
  const summaryLower = summary.toLowerCase();
  const staffNames = ['karim', 'kareem', 'maggie', 'cruz'];
  for (const staffName of staffNames) {
    if (summaryLower.includes(staffName)) {
      console.log(`   ✅ Sending "Other" email: mentions staff member "${staffName}"`);
      return true;
    }
  }

  // SKIP: Summary indicates obviously non-actionable content (quick filter before AI)
  const skipPatterns = [
    /no.*transcript/i,
    /caller.*hung.*up.*immediately/i,
    /wrong.*number/i,
    /misdial/i,
    /test.*call/i
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(summary)) {
      console.log(`   ⏭️  Skipping "Other" email: matches skip pattern (${pattern})`);
      return false;
    }
  }

  // If no summary at all, skip
  if (!summary || summary.trim().length < 10) {
    console.log(`   ⏭️  Skipping "Other" email: no meaningful summary`);
    return false;
  }

  // Use AI to determine if this call is relevant/actionable
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic();

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `You are evaluating if a law firm should be notified about this "Other" category call.

Call Summary: "${summary}"
Caller Name: "${name}"
Call Duration: ${callDuration} seconds

Should the law firm receive an email notification about this call?

SEND notification if the caller:
- Has a specific question or request
- Wants to speak to someone specific
- Has a legitimate business purpose
- Is following up on something
- Needs information or assistance

DO NOT send notification if:
- Caller hung up without stating purpose
- Wrong number or misdial
- No meaningful conversation occurred
- Just silence or unintelligible
- Automated/robocall

Reply with ONLY "SEND" or "SKIP" (one word).`
      }]
    });

    const decision = response.content[0].text.trim().toUpperCase();

    if (decision === 'SEND') {
      console.log(`   ✅ AI approved "Other" email: call appears relevant`);
      return true;
    } else {
      console.log(`   ⏭️  AI filtered "Other" email: call not actionable`);
      return false;
    }
  } catch (error) {
    // If AI fails, fall back to basic check: has name and some summary
    console.log(`   ⚠️  AI filter failed, using fallback: ${error.message}`);
    const hasValidName = name && name.length > 2 && name.toLowerCase() !== 'unknown';
    return hasValidName && summary.length > 20;
  }
}

/**
 * Send notifications for a call
 * @param {string} agentId - Retell agent ID to identify the client
 * @param {string} category - Call category (New Lead, Attorney, etc.)
 * @param {object} callData - Call data including transcript, caller info, etc.
 */
async function sendNotifications(agentId, category, callData) {
  console.log(`\n📧 Sending notifications for ${category} call (Agent: ${agentId.substring(0, 20)}...)`);

  // FILTER: Skip "Other" calls that aren't actionable (uses AI to evaluate)
  if (category === 'Other') {
    const shouldSend = await shouldSendOtherEmail(callData);
    if (!shouldSend) {
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
