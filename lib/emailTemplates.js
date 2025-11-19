// Email Template Functions
// Converts N8N templates to JavaScript template literals

const fs = require('fs');
const path = require('path');

// Load raw templates from files
const templatesDir = path.join(__dirname, '../templates');

const rawTemplates = {
  attorney: fs.readFileSync(path.join(templatesDir, 'email_attorney_raw.html'), 'utf8'),
  medical: fs.readFileSync(path.join(templatesDir, 'email_medical_raw.html'), 'utf8'),
  other: fs.readFileSync(path.join(templatesDir, 'email_other_raw.html'), 'utf8'),
  new_lead: fs.readFileSync(path.join(templatesDir, 'email_new_lead_raw.html'), 'utf8'),
  existing_client: fs.readFileSync(path.join(templatesDir, 'email_existing_client_raw.html'), 'utf8')
};

/**
 * Convert N8N template syntax to JavaScript
 * {{ $json.fieldName }} → ${data.fieldName || 'Not provided'}
 */
function convertN8NTemplate(template, data) {
  let result = template;

  // Remove the leading "=" if present (N8N syntax)
  if (result.startsWith('=')) {
    result = result.substring(1);
  }

  // Replace all {{ $json.fieldName }} with actual data
  result = result.replace(/\{\{\s*\$json\.(\w+)\s*\}\}/g, (match, fieldName) => {
    return data[fieldName] || 'Not provided';
  });

  // Replace {{ $json['Field Name'] }} (with brackets and quotes)
  result = result.replace(/\{\{\s*\$json\['([^']+)'\]\s*\}\}/g, (match, fieldName) => {
    return data[fieldName] || 'Not provided';
  });

  return result;
}

/**
 * Attorney Email Template
 */
function generateAttorneyEmail(callData) {
  const data = {
    Name: callData.name || 'Unknown',
    Phone: callData.phone || callData.phone_number || 'Not provided',
    InboundPhoneNum: callData.from_number || callData.to_number || 'Not available',
    Email: callData.email || callData.email_address || 'Not provided',
    'Who Representing': callData.who_representing || callData.representing_who || 'Not provided',
    'Case Name': callData.case_name || callData.client_name || 'Not provided',
    'Claim Num': callData.claim_number || callData.claim_num || 'Not provided',
    Purpose: callData.purpose || callData.call_purpose || 'Attorney inquiry'
  };

  return {
    subject: 'Inbound Call Alert — Attorney',
    html: convertN8NTemplate(rawTemplates.attorney, data)
  };
}

/**
 * Medical Professional Email Template
 */
function generateMedicalEmail(callData) {
  const data = {
    Name: callData.name || 'Unknown',
    Phone: callData.phone || callData.phone_number || 'Not provided',
    InboundPhoneNum: callData.from_number || callData.to_number || 'Not available',
    Email: callData.email || callData.email_address || 'Not provided',
    Claim: callData.claim_num || callData.claim_number || 'Not provided',
    representing_who: callData.representing_who || callData.who_representing || 'Not provided',
    client_name: callData.client_name || callData.case_name || 'Not provided',
    Purpose: callData.purpose || callData.call_purpose || 'Medical inquiry'
  };

  return {
    subject: 'Inbound Call Alert — Medical Professional',
    html: convertN8NTemplate(rawTemplates.medical, data)
  };
}

/**
 * Other Caller Email Template
 */
function generateOtherEmail(callData) {
  const data = {
    Name: callData.name || callData.first_name + ' ' + callData.last_name || 'Unknown',
    Phone: callData.phone || callData.phone_number || 'Not provided',
    from_number: callData.from_number || callData.to_number || 'Not available',
    Email: callData.email || callData.email_address || 'Not provided',
    Purpose: callData.purpose || callData.call_purpose || 'General inquiry',
    representing_who: callData.representing_who || callData.who_representing || 'Not provided',
    client_name: callData.client_name || callData.case_name || 'Not provided',
    claim_num: callData.claim_num || callData.claim_number || 'Not provided'
  };

  return {
    subject: 'Inbound Call Alert — Other Caller',
    html: convertN8NTemplate(rawTemplates.other, data)
  };
}

/**
 * New Lead Email Template
 */
function generateNewLeadEmail(callData) {
  const data = {
    Name: callData.name || callData.first_name + ' ' + callData.last_name || 'Unknown',
    Phone: callData.phone || callData.phone_number || 'N/A',
    InboundPhoneNum: callData.from_number || callData.to_number || 'N/A',
    Email: callData.email || callData.email_address || 'N/A',
    Incident_Description: callData.incident_description || callData.summary || callData.purpose || 'New lead inquiry'
  };

  return {
    subject: 'Inbound Call Alert — New Client Lead',
    html: convertN8NTemplate(rawTemplates.new_lead, data)
  };
}

/**
 * Existing Client Email Template
 */
function generateExistingClientEmail(callData) {
  const data = {
    Name: callData.name || (callData.first_name + ' ' + callData.last_name) || 'Unknown',
    Phone: callData.phone || callData.phone_number || 'Not provided',
    InboundPhoneNum: callData.from_number || callData.to_number || 'Not available',
    Email: callData.email || callData.email_address || 'Not provided',
    Purpose: callData.purpose || callData.call_purpose || 'Client follow-up',
    representing_who: callData.representing_who || callData.who_representing || 'Not provided',
    client_name: callData.client_name || callData.case_name || 'Not provided',
    claim_num: callData.claim_num || callData.claim_number || 'Not provided'
  };

  return {
    subject: 'Inbound Call Alert — Call from Existing Client',
    html: convertN8NTemplate(rawTemplates.existing_client, data)
  };
}

/**
 * Main function: Generate email based on category
 */
function generateEmail(category, callData) {
  const categoryMap = {
    'Attorney': generateAttorneyEmail,
    'Medical': generateMedicalEmail,
    'Medical Professional': generateMedicalEmail,
    'Insurance': generateMedicalEmail, // Use medical template for insurance too
    'Other': generateOtherEmail,
    'New Lead': generateNewLeadEmail,
    'Existing Client': generateExistingClientEmail,
    'Existing': generateExistingClientEmail
  };

  const generator = categoryMap[category];
  if (!generator) {
    console.warn(`⚠️  Unknown category: ${category}, using Other template`);
    return generateOtherEmail(callData);
  }

  return generator(callData);
}

/**
 * Generate SMS message for New Leads
 */
function generateSMS(callData) {
  const name = callData.name || 'Unknown';
  const phone = callData.phone || callData.phone_number || 'N/A';
  const email = callData.email || callData.email_address || 'N/A';
  const summary = callData.incident_description || callData.summary || callData.purpose || 'New lead inquiry';

  return `New Inbound Lead

Name: ${name}
Phone Number: ${phone}
Email: ${email}
Summary: ${summary}`;
}

module.exports = {
  generateEmail,
  generateSMS
};
