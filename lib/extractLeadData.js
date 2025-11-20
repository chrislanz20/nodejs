// Extract structured lead data from call transcripts using AI
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Extract email, name, and other important details from a call transcript
 * Uses Claude Haiku for cost-effective extraction
 * @param {string} transcript - The call transcript
 * @returns {object} Extracted data: { email, name, incident_description, incident_date, incident_location }
 */
async function extractLeadDataFromTranscript(transcript) {
  if (!transcript || transcript.trim().length === 0) {
    return null;
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022', // Claude 3.5 Haiku - matches categorization model
      max_tokens: 500,
      temperature: 0, // Deterministic extraction
      messages: [{
        role: 'user',
        content: `Extract the following information from this call transcript. Return ONLY valid JSON with no additional text.

Required fields (use null if not found):
- email: Email address (format: user@domain.com)
- name: Full name of the caller
- incident_description: Brief description of what happened (1-2 sentences)
- incident_date: Date of incident if mentioned (format: YYYY-MM-DD)
- incident_location: Where the incident occurred

Transcript:
${transcript}

Return format:
{
  "email": "user@domain.com or null",
  "name": "Full Name or null",
  "incident_description": "Brief description or null",
  "incident_date": "YYYY-MM-DD or null",
  "incident_location": "Location or null"
}`
      }]
    });

    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent) {
      console.error('No text content in AI response');
      return null;
    }

    // Parse the JSON response
    const extracted = JSON.parse(textContent.text);

    // Clean up email - handle spelled out format like "m o n r o e j three one nine at gmail dot com"
    if (extracted.email && extracted.email !== 'null') {
      // Already in proper format
      return extracted;
    }

    // If email wasn't extracted, try to find it in the transcript directly
    const emailMatch = transcript.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
    if (emailMatch) {
      extracted.email = emailMatch[1].toLowerCase();
    }

    return extracted;

  } catch (error) {
    console.error('❌ Error extracting lead data from transcript:', error.message);
    return null;
  }
}

/**
 * Enrich lead data by combining existing data with transcript extraction
 * @param {object} existingData - Current lead data
 * @param {object} extractedData - Data extracted from transcript
 * @returns {object} Merged and enriched data
 */
function enrichLeadData(existingData, extractedData) {
  if (!extractedData) return existingData;

  return {
    email: extractedData.email || existingData.email || null,
    name: extractedData.name || existingData.name || null,
    incident_description: extractedData.incident_description || existingData.incident_description || null,
    incident_date: extractedData.incident_date || existingData.incident_date || null,
    incident_location: extractedData.incident_location || existingData.incident_location || null
  };
}

module.exports = {
  extractLeadDataFromTranscript,
  enrichLeadData
};
