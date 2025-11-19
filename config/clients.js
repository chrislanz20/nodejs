// Multi-Tenant Client Configuration
// Each client is keyed by their Retell Agent ID

const CLIENT_CONFIGS = {
  // CourtLaw Configuration
  'agent_8e50b96f7e7bb7ce7479219fcc': {
    client_name: 'CourtLaw',

    // GoHighLevel Configuration
    ghl_location_id: 'lneM3M1j3P5i0JYeNK18',
    ghl_api_key: 'pit-e0730a40-bcf9-43bc-bb39-9fc71668b7d2',

    // Mode: 'test' or 'production'
    // In test mode, notifications only go to test recipients
    mode: 'test',

    // Email Recipients
    email_recipients: {
      test: ['17lanzch@gmail.com'],
      production: {
        all_staff: [
          'info@courtlaw.com',
          'Karzadi@courtlaw.com',
          'chris@saveyatech.com',
          'matt@saveyatech.com',
          'svasquez@courtlaw.com',
          'mlabrada@courtlaw.com',
          'mcruz@courtlaw.com',
          'eblair@courtlaw.com',
          'aestivenson@courtlaw.com'
        ],
        key_staff: [
          'info@courtlaw.com',
          'Karzadi@courtlaw.com',
          'chris@saveyatech.com',
          'matt@saveyatech.com'
        ]
      }
    },

    // SMS Recipients
    sms_recipients: {
      test: ['+17814757191'],
      production: [
        '+17814757191',
        '+19089065142',
        '+17322082416'
      ]
    },

    // GoHighLevel Contact IDs (for API calls)
    // In test mode, we use Chris's contact
    // In production, we'll create contacts for each staff member
    ghl_contact_ids: {
      test: ['msF0VOnxJ584ga7knXF2'],
      production: [] // Will be populated when going live
    }
  }

  // Future clients can be added here:
  // 'agent_ANOTHER_CLIENT_ID': { ... }
};

/**
 * Get client configuration by agent ID
 */
function getClientConfig(agentId) {
  const config = CLIENT_CONFIGS[agentId];
  if (!config) {
    console.warn(`⚠️  No configuration found for agent: ${agentId}`);
    return null;
  }
  return config;
}

/**
 * Get email recipients for a client based on category
 */
function getEmailRecipients(agentId, category) {
  const config = getClientConfig(agentId);
  if (!config) return [];

  if (config.mode === 'test') {
    return config.email_recipients.test;
  }

  // In production mode, New Leads go to key staff only
  if (category === 'New Lead') {
    return config.email_recipients.production.key_staff;
  }

  // All other categories go to all staff
  return config.email_recipients.production.all_staff;
}

/**
 * Get SMS recipients for a client
 * SMS only sent for New Leads
 */
function getSMSRecipients(agentId, category) {
  const config = getClientConfig(agentId);
  if (!config) return [];

  // Only send SMS for New Leads
  if (category !== 'New Lead') {
    return [];
  }

  if (config.mode === 'test') {
    return config.sms_recipients.test;
  }

  return config.sms_recipients.production;
}

/**
 * Get GoHighLevel contact IDs for sending messages
 */
function getGHLContactIds(agentId) {
  const config = getClientConfig(agentId);
  if (!config) return [];

  if (config.mode === 'test') {
    return config.ghl_contact_ids.test;
  }

  return config.ghl_contact_ids.production;
}

module.exports = {
  CLIENT_CONFIGS,
  getClientConfig,
  getEmailRecipients,
  getSMSRecipients,
  getGHLContactIds
};
