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
    Purpose: callData.purpose || callData.call_purpose || callData.incident_description || 'Attorney inquiry'
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
    Purpose: callData.purpose || callData.call_purpose || callData.incident_description || 'Medical inquiry'
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
    Purpose: callData.purpose || callData.call_purpose || callData.incident_description || 'General inquiry',
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
    name: callData.name || (callData.first_name && callData.last_name ? callData.first_name + ' ' + callData.last_name : 'Unknown'),
    phone: callData.phone || callData.phone_number || 'Not provided',
    from_number: callData.from_number || callData.to_number || 'Not provided',
    email: callData.email || callData.email_address || 'Not provided',
    incident_description: callData.call_summary || callData.incident_description || callData.summary || callData.purpose || 'New lead inquiry',
    case_type: callData.case_type || '',
    incident_date: callData.incident_date || '',
    incident_location: callData.incident_location || '',

    // Rideshare fields
    rideshare_service: callData.rideshare_service || '',
    rideshare_role: callData.rideshare_role || '',
    rideshare_driver_info: callData.rideshare_driver_info || '',

    // Construction fields
    construction_site_type: callData.construction_site_type || '',
    injury_cause: callData.injury_cause || '',
    employer_name: callData.employer_name || '',
    safety_equipment: callData.safety_equipment || '',

    // Slip & Fall fields
    property_type: callData.property_type || '',
    fall_cause: callData.fall_cause || '',
    property_owner: callData.property_owner || '',
    witnesses_present: callData.witnesses_present || '',

    // Workers' Comp fields
    workplace_type: callData.workplace_type || '',
    work_injury_type: callData.work_injury_type || '',
    injury_reported: callData.injury_reported || '',
    doctor_visit: callData.doctor_visit || '',

    // Vehicle accident fields
    vehicle_type: callData.vehicle_type || '',
    fault_determination: callData.fault_determination || '',
    police_report_filed: callData.police_report_filed || '',
    other_party_insured: callData.other_party_insured || '',
    injuries_sustained: callData.injuries_sustained || ''
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
    Purpose: callData.purpose || callData.call_purpose || callData.incident_description || 'Client follow-up',
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
 * Generate timestamp string for email subject to prevent threading
 * Format: "Nov 21, 10:07 AM" (US Eastern Time)
 */
function getEmailTimestamp() {
  const now = new Date();
  return now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
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

  const result = generator(callData);

  // Add timestamp to subject to prevent email threading
  result.subject = `${result.subject} (${getEmailTimestamp()})`;

  return result;
}

/**
 * Generate SMS message for New Leads
 */
function generateSMS(callData) {
  const name = callData.name || 'Unknown';
  const verbalPhone = callData.phone || callData.phone_number || 'N/A';
  const inboundPhone = callData.from_number || callData.to_number || 'N/A';
  const email = callData.email || callData.email_address || 'N/A';
  const summary = callData.call_summary || callData.incident_description || callData.summary || callData.purpose || 'New lead inquiry';
  const caseType = callData.case_type ? ` (${callData.case_type})` : '';

  return `New Inbound Lead${caseType}

Name: ${name}
Verbally Stated Phone: ${verbalPhone}
Inbound Caller ID: ${inboundPhone}
Email: ${email}

Summary: ${summary}`;
}

module.exports = {
  generateEmail,
  generateSMS
};
