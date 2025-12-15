// Comprehensive extraction accuracy test
require("dotenv").config({ path: ".env.local" });

const Retell = require("retell-sdk").default;
const client = new Retell({ apiKey: process.env.RETELL_API_KEY });
const { extractAllCallData } = require("./lib/extractAllCallData");

// Find email readback in transcript
function findEmailReadback(transcript) {
  for (let i = 0; i < transcript.length; i++) {
    const msg = transcript[i];
    const content = msg.content.toLowerCase();

    if (msg.role === 'agent' && content.includes(' at ') &&
        (content.includes('dot com') || content.includes('dot net') || content.includes('dot org') || content.includes('dot gov') ||
         content.includes('dot g-o-v') || content.includes('dot c-o-m'))) {

      // Check if user confirmed
      if (i + 1 < transcript.length && transcript[i + 1].role === 'user') {
        const userResp = transcript[i + 1].content.toLowerCase().trim();
        if (['yes', 'yes.', 'correct', 'correct.', 'yeah', 'yeah.', 'yep', 'yep.'].includes(userResp) ||
            userResp.includes("that's right")) {
          return { readback: msg.content, confirmed: true };
        }
      }
    }
  }
  return { readback: null, confirmed: false };
}

// Find claim number readback in transcript
function findClaimReadback(transcript) {
  let inClaimSection = false;

  for (let i = 0; i < transcript.length; i++) {
    const msg = transcript[i];
    const content = msg.content.toLowerCase();

    if (content.includes('claim') || content.includes('policy') || content.includes('file number')) {
      inClaimSection = true;
    }

    if (inClaimSection && msg.role === 'agent' &&
        (content.includes('is that correct') || content.includes('did i get')) &&
        /\d/.test(msg.content) && !content.includes('phone') && !content.includes('email')) {

      // Check if user confirmed
      if (i + 1 < transcript.length && transcript[i + 1].role === 'user') {
        const userResp = transcript[i + 1].content.toLowerCase().trim();
        if (['yes', 'yes.', 'correct', 'correct.', 'yeah', 'yeah.', 'yep', 'yep.'].includes(userResp) ||
            userResp.includes("that's right")) {
          return { readback: msg.content, confirmed: true };
        }
      }
    }
  }
  return { readback: null, confirmed: false };
}

async function testCall(call, index) {
  const transcript = call.transcript_object;
  if (!transcript || transcript.length < 3) return null;

  const estTime = new Date(call.start_timestamp).toLocaleString("en-US", { timeZone: "America/New_York" });

  const emailInfo = findEmailReadback(transcript);
  const claimInfo = findClaimReadback(transcript);

  // Skip calls with no readbacks
  if (!emailInfo.confirmed && !claimInfo.confirmed) return null;

  // Run extraction
  let extracted;
  try {
    extracted = await extractAllCallData(transcript, "Insurance");
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    return null;
  }

  return {
    index,
    callId: call.call_id,
    time: estTime,
    from: call.from_number,
    emailReadback: emailInfo.readback,
    emailConfirmed: emailInfo.confirmed,
    claimReadback: claimInfo.readback,
    claimConfirmed: claimInfo.confirmed,
    extractedEmail: extracted?.email,
    extractedClaim: extracted?.claim_number,
  };
}

async function main() {
  console.log("Fetching calls from Retell API...\n");

  // Get as many calls as possible
  const allCalls = [];
  let hasMore = true;
  let lastCallId = null;

  while (hasMore && allCalls.length < 200) {
    const options = { limit: 100 };
    if (lastCallId) {
      options.pagination_key = lastCallId;
    }

    const calls = await client.call.list(options);
    if (calls.length === 0) {
      hasMore = false;
    } else {
      allCalls.push(...calls);
      lastCallId = calls[calls.length - 1].call_id;
      console.log(`Fetched ${allCalls.length} calls...`);

      if (calls.length < 100) hasMore = false;
    }
  }

  console.log(`\nTotal calls fetched: ${allCalls.length}`);

  // Filter to calls with transcripts
  const validCalls = allCalls.filter(c =>
    c.transcript_object &&
    c.transcript_object.length >= 3 &&
    (c.end_timestamp - c.start_timestamp) > 30000
  );

  console.log(`Calls with valid transcripts: ${validCalls.length}`);
  console.log(`\nTesting extraction...\n`);

  const results = [];
  const errors = [];

  for (let i = 0; i < validCalls.length; i++) {
    const result = await testCall(validCalls[i], i + 1);
    if (result) {
      results.push(result);

      // Check for potential issues
      if (result.emailConfirmed && !result.extractedEmail) {
        errors.push({ type: 'email_not_extracted', ...result });
      }
      if (result.claimConfirmed && !result.extractedClaim) {
        errors.push({ type: 'claim_not_extracted', ...result });
      }
    }

    // Progress
    if ((i + 1) % 20 === 0) {
      console.log(`  Processed ${i + 1}/${validCalls.length} calls, found ${results.length} with readbacks`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("COMPREHENSIVE TEST RESULTS");
  console.log("=".repeat(70));

  const withEmailReadback = results.filter(r => r.emailConfirmed);
  const withClaimReadback = results.filter(r => r.claimConfirmed);
  const emailExtracted = withEmailReadback.filter(r => r.extractedEmail);
  const claimExtracted = withClaimReadback.filter(r => r.extractedClaim);

  console.log(`\nTotal calls tested: ${validCalls.length}`);
  console.log(`Calls with confirmed readbacks: ${results.length}`);

  console.log(`\nEMAIL EXTRACTION:`);
  console.log(`  Calls with confirmed email readback: ${withEmailReadback.length}`);
  console.log(`  Successfully extracted: ${emailExtracted.length}`);
  console.log(`  Success rate: ${withEmailReadback.length > 0 ? ((emailExtracted.length / withEmailReadback.length) * 100).toFixed(1) : 0}%`);

  console.log(`\nCLAIM NUMBER EXTRACTION:`);
  console.log(`  Calls with confirmed claim readback: ${withClaimReadback.length}`);
  console.log(`  Successfully extracted: ${claimExtracted.length}`);
  console.log(`  Success rate: ${withClaimReadback.length > 0 ? ((claimExtracted.length / withClaimReadback.length) * 100).toFixed(1) : 0}%`);

  if (errors.length > 0) {
    console.log(`\n${"=".repeat(70)}`);
    console.log("POTENTIAL ISSUES");
    console.log("=".repeat(70));

    for (const err of errors) {
      console.log(`\n[${err.type}] Call ${err.index}: ${err.time}`);
      console.log(`  From: ${err.from}`);
      if (err.type === 'email_not_extracted') {
        console.log(`  Email readback: "${err.emailReadback?.substring(0, 100)}..."`);
        console.log(`  Extracted: ${err.extractedEmail || 'null'}`);
      }
      if (err.type === 'claim_not_extracted') {
        console.log(`  Claim readback: "${err.claimReadback?.substring(0, 100)}..."`);
        console.log(`  Extracted: ${err.extractedClaim || 'null'}`);
      }
    }
  }

  // Show all email extractions for manual review
  console.log(`\n${"=".repeat(70)}`);
  console.log("ALL EMAIL EXTRACTIONS (for manual review)");
  console.log("=".repeat(70));

  for (const r of withEmailReadback) {
    console.log(`\n[Call ${r.index}] ${r.time} - ${r.from}`);
    console.log(`  Readback: "${r.emailReadback?.substring(0, 80)}..."`);
    console.log(`  Extracted: ${r.extractedEmail || 'null'}`);
  }

  // Show all claim extractions for manual review
  if (withClaimReadback.length > 0) {
    console.log(`\n${"=".repeat(70)}`);
    console.log("ALL CLAIM NUMBER EXTRACTIONS (for manual review)");
    console.log("=".repeat(70));

    for (const r of withClaimReadback) {
      console.log(`\n[Call ${r.index}] ${r.time} - ${r.from}`);
      console.log(`  Readback: "${r.claimReadback?.substring(0, 80)}..."`);
      console.log(`  Extracted: ${r.extractedClaim || 'null'}`);
    }
  }
}

main().catch(console.error);
