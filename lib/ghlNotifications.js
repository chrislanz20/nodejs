// Notifications Module
// Handles sending emails via Resend and SMS via GoHighLevel API

const axios = require('axios');
const { Pool } = require('pg');
const { Resend } = require('resend');
const { getClientConfig, getGHLContactIds, getEmailRecipients } = require('../config/clients');
const { generateEmail, generateSMS } = require('./emailTemplates');

// Initialize Resend client for email sending
const resend = new Resend(process.env.RESEND_API_KEY);

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

// Database connection for notification recipients
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 5
});

/**
 * Get notification recipients from database for an agent
 * Returns recipients with their category-specific preferences
 */
async function getNotificationRecipients(agentId, category) {
  try {
    // Map category name to database column prefix
    const categoryMap = {
      'New Lead': 'new_lead',
      'Existing Client': 'existing_client',
      'Attorney': 'attorney',
      'Insurance': 'insurance',
      'Medical': 'medical',
      'Other': 'other'
    };

    const categoryPrefix = categoryMap[category] || 'other';

    const result = await pool.query(`
      SELECT
        nr.id, nr.name, nr.email, nr.phone, nr.ghl_contact_id, nr.active,
        np.${categoryPrefix}_email as email_enabled,
        np.${categoryPrefix}_sms as sms_enabled
      FROM notification_recipients nr
      LEFT JOIN notification_preferences np ON nr.id = np.recipient_id
      WHERE nr.agent_id = $1 AND nr.active = true
    `, [agentId]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching notification recipients:', error.message);
    return [];
  }
}

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
 * Send email via Resend API (with retry)
 * @param {string} toEmail - Recipient email address
 * @param {string} toName - Recipient name (for logging)
 * @param {string} subject - Email subject
 * @param {string} htmlContent - Email HTML content
 * @param {string} fromName - Sender name (defaults to 'SaveYa Tech')
 */
async function sendEmailViaResend(toEmail, toName, subject, htmlContent, fromName = 'SaveYa Tech') {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await resend.emails.send({
        from: `${fromName} <notifications@saveyatech.com>`,
        to: toEmail,
        subject: subject,
        html: htmlContent
      });

      if (error) {
        throw new Error(error.message);
      }

      return {
        success: true,
        messageId: data.id,
        email: toEmail
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

  console.error(`❌ Failed to send email to ${toEmail} after ${MAX_RETRIES} attempts:`, lastError.message);
  return {
    success: false,
    error: lastError.message,
    email: toEmail
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
    source: 'fallback', // Will be updated if using database
    emails_sent: [],
    sms_sent: [],
    errors: []
  };

  // Generate email and SMS content
  const emailData = generateEmail(category, callData);
  const smsMessage = generateSMS(callData);
  console.log(`📝 Generated email: "${emailData.subject}"`);

  // Check database for notification recipients first
  const dbRecipients = await getNotificationRecipients(agentId, category);

  if (dbRecipients.length > 0) {
    // USE DATABASE RECIPIENTS
    console.log(`📋 Using database notification settings (${dbRecipients.length} recipient(s) configured)`);
    results.source = 'database';

    // Filter recipients who should receive emails for this category (need email address)
    const emailRecipients = dbRecipients.filter(r => r.email_enabled && r.email);
    // Filter recipients who should receive SMS for this category (need GHL contact for SMS)
    const smsRecipients = dbRecipients.filter(r => r.sms_enabled && r.ghl_contact_id && r.phone);

    console.log(`   - ${emailRecipients.length} recipient(s) will receive email (via Resend)`);
    console.log(`   - ${smsRecipients.length} recipient(s) will receive SMS (via GHL)`);

    // Send emails via Resend to recipients who have email enabled for this category
    for (const recipient of emailRecipients) {
      const result = await sendEmailViaResend(
        recipient.email,
        recipient.name,
        emailData.subject,
        emailData.html,
        config.client_name || 'SaveYa Tech'
      );

      if (result.success) {
        console.log(`✅ Email sent to ${recipient.name} (${recipient.email}) via Resend`);
        results.emails_sent.push({ ...result, name: recipient.name, email: recipient.email });
      } else {
        console.error(`❌ Email failed for ${recipient.name}`);
        results.errors.push({ ...result, name: recipient.name, email: recipient.email });
      }
    }

    // Send SMS to recipients who have SMS enabled for this category
    for (const recipient of smsRecipients) {
      const result = await sendSMSToContact(
        config.ghl_location_id,
        config.ghl_api_key,
        recipient.ghl_contact_id,
        smsMessage
      );

      if (result.success) {
        console.log(`✅ SMS sent to ${recipient.name} (${recipient.phone})`);
        results.sms_sent.push({ ...result, name: recipient.name, phone: recipient.phone });
      } else {
        console.error(`❌ SMS failed for ${recipient.name}`);
        results.errors.push({ ...result, name: recipient.name, phone: recipient.phone });
      }
    }
  } else {
    // FALLBACK TO HARDCODED CONFIG
    console.log(`⚠️  No database recipients configured - using fallback (hardcoded) configuration`);
    results.source = 'fallback';

    // Get email recipients from hardcoded config
    const emailAddresses = getEmailRecipients(agentId, category);
    console.log(`👥 Sending emails to ${emailAddresses.length} recipient(s) via Resend in ${config.mode} mode`);

    // Send emails via Resend (fallback behavior)
    for (const email of emailAddresses) {
      const result = await sendEmailViaResend(
        email,
        email, // Use email as name since we don't have names in fallback
        emailData.subject,
        emailData.html,
        config.client_name || 'SaveYa Tech'
      );

      if (result.success) {
        console.log(`✅ Email sent to ${email} via Resend: ${result.messageId}`);
        results.emails_sent.push(result);
      } else {
        console.error(`❌ Email failed for ${email}`);
        results.errors.push(result);
      }
    }

    // Send SMS only for New Leads via GHL (fallback behavior)
    if (category === 'New Lead') {
      console.log(`📱 Sending SMS for New Lead via GHL...`);
      const contactIds = getGHLContactIds(agentId);

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
      console.log(`ℹ️  No SMS sent (category: ${category} - SMS only sent for New Leads in fallback mode)`);
    }
  }

  // Summary
  console.log(`\n📊 Notification Summary for ${config.client_name}:`);
  console.log(`   - Source: ${results.source}`);
  console.log(`   - Emails sent: ${results.emails_sent.length}`);
  console.log(`   - SMS sent: ${results.sms_sent.length}`);
  console.log(`   - Errors: ${results.errors.length}`);

  return results;
}

/**
 * Search for a GHL contact by email
 * @param {string} locationId - GHL location ID
 * @param {string} apiKey - GHL API key
 * @param {string} email - Email to search for
 * @returns {object|null} Contact object or null if not found
 */
async function searchGHLContact(locationId, apiKey, email) {
  try {
    const response = await axios.get(
      `${GHL_BASE_URL}/contacts/search/duplicate`,
      {
        params: {
          locationId: locationId,
          email: email
        },
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Version': GHL_API_VERSION
        },
        timeout: 30000
      }
    );

    const contact = response.data?.contact;
    if (contact && contact.id) {
      console.log(`   ✅ Found existing GHL contact: ${contact.id} (${email})`);
      return contact;
    }
    return null;
  } catch (error) {
    // 404 means no contact found - that's okay
    if (error.response?.status === 404) {
      console.log(`   ℹ️  No existing GHL contact found for ${email}`);
      return null;
    }
    console.error(`   ⚠️  Error searching GHL contact:`, error.response?.data || error.message);
    return null;
  }
}

/**
 * Create a new GHL contact
 * @param {string} locationId - GHL location ID
 * @param {string} apiKey - GHL API key
 * @param {object} contactData - Contact details (name, email, phone)
 * @returns {object|null} Created contact object or null on failure
 */
async function createGHLContact(locationId, apiKey, contactData) {
  try {
    // Parse name into first/last
    const nameParts = (contactData.name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const payload = {
      locationId: locationId,
      email: contactData.email,
      firstName: firstName,
      lastName: lastName,
      tags: ['notification-recipient', 'ai-receptionist']
    };

    // Only add phone if provided
    if (contactData.phone) {
      payload.phone = contactData.phone;
    }

    const response = await axios.post(
      `${GHL_BASE_URL}/contacts/`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Version': GHL_API_VERSION
        },
        timeout: 30000
      }
    );

    const contact = response.data?.contact;
    if (contact && contact.id) {
      console.log(`   ✅ Created new GHL contact: ${contact.id} (${contactData.email})`);
      return contact;
    }
    return null;
  } catch (error) {
    console.error(`   ❌ Error creating GHL contact:`, error.response?.data || error.message);
    return null;
  }
}

/**
 * Find or create a GHL contact
 * @param {string} locationId - GHL location ID
 * @param {string} apiKey - GHL API key
 * @param {object} contactData - Contact details (name, email, phone)
 * @returns {string|null} Contact ID or null on failure
 */
async function findOrCreateGHLContact(locationId, apiKey, contactData) {
  console.log(`   🔍 Looking up GHL contact for ${contactData.email}...`);

  // First try to find existing contact
  const existingContact = await searchGHLContact(locationId, apiKey, contactData.email);
  if (existingContact) {
    return existingContact.id;
  }

  // Create new contact if not found
  console.log(`   📝 Creating new GHL contact for ${contactData.email}...`);
  const newContact = await createGHLContact(locationId, apiKey, contactData);
  if (newContact) {
    return newContact.id;
  }

  return null;
}

module.exports = {
  sendNotifications,
  sendEmailViaResend,
  sendSMSToContact,
  searchGHLContact,
  createGHLContact,
  findOrCreateGHLContact
};
