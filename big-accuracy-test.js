// Big accuracy test - find ALL calls with confirmed email readbacks and check extraction
require("dotenv").config({ path: ".env.local" });
const { extractAllCallData } = require("./lib/extractAllCallData");
const Retell = require("retell-sdk").default;
const client = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Parse email from agent's readback (ground truth)
function parseEmailFromReadback(readback) {
  // This is a simple parser to get the "expected" email from the readback
  // Format: "G-E-I-C-O C-L-A-I-M-S at G-E-I-C-O dot com"
  // Or: "D, T, A, B, E, T, at I, G, E, A, N, E, U, R, O, dot com"

  const content = readback.toLowerCase();

  // Find "at" and "dot"
  const atIndex = content.indexOf(' at ');
  const dotIndex = content.lastIndexOf(' dot ');

  if (atIndex === -1 || dotIndex === -1) return null;

  const beforeAt = readback.substring(0, atIndex);
  const domain = readback.substring(atIndex + 4, dotIndex);
  const tldPart = readback.substring(dotIndex + 5).split(/\s+/)[0];

  // Extract letters from spelled portion
  function extractLetters(text) {
    let result = '';
    // Handle "one", "two", etc.
    const numberWords = { 'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9' };
    const specialWords = { 'underscore': '_', 'dash': '-', 'hyphen': '-' };

    // Split by various separators
    const tokens = text.toLowerCase().split(/[-,\s]+/);
    for (const token of tokens) {
      const clean = token.replace(/[^a-z0-9]/g, '');
      if (!clean) continue;
      if (numberWords[clean]) {
        result += numberWords[clean];
      } else if (specialWords[clean]) {
        result += specialWords[clean];
      } else if (clean.length === 1) {
        result += clean;
      } else if (clean.length > 1 && !['is', 'that', 'correct', 'the', 'to', 'confirm', 'at', 'dot', 'let', 'me', 'spell', 'back', 'thank', 'you'].includes(clean)) {
        result += clean;
      }
    }
    return result;
  }

  const local = extractLetters(beforeAt);
  const dom = extractLetters(domain);
  const tld = tldPart.replace(/-/g, '').replace(/[^a-z]/g, '');

  if (!local || !dom || !tld) return null;
  return `${local}@${dom}.${tld}`;
}

async function runBigTest() {
  console.log("Fetching calls...\n");

  const allCalls = [];
  let hasMore = true;
  let lastCallId = null;

  while (hasMore && allCalls.length < 100) {
    const options = { limit: 100 };
    if (lastCallId) options.pagination_key = lastCallId;

    const calls = await client.call.list(options);
    if (calls.length === 0) {
      hasMore = false;
    } else {
      allCalls.push(...calls);
      lastCallId = calls[calls.length - 1].call_id;
      if (calls.length < 100) hasMore = false;
    }
  }

  console.log(`Total calls: ${allCalls.length}\n`);

  // Find calls with confirmed email readbacks
  const testCases = [];

  for (const call of allCalls) {
    if (!call.transcript_object || call.transcript_object.length < 5) continue;

    for (let i = 0; i < call.transcript_object.length; i++) {
      const msg = call.transcript_object[i];
      if (msg.role !== 'agent') continue;

      const content = msg.content.toLowerCase();

      // Check if this is an email readback
      const hasSpelling = /[a-z]-[a-z]-[a-z]/i.test(msg.content) || /[A-Z],\s*[A-Z],\s*[A-Z]/.test(msg.content) || /\b[A-Z] [A-Z] [A-Z]\b/.test(msg.content);
      const hasAt = content.includes(' at ');
      const hasDot = /dot\s+(com|net|org|gov)/i.test(content);
      const isConfirmation = content.includes('is that correct') || content.includes('did i get');

      if (hasSpelling && hasAt && hasDot && isConfirmation) {
        // Check if user confirmed
        if (i + 1 < call.transcript_object.length) {
          const nextMsg = call.transcript_object[i + 1];
          if (nextMsg.role === 'user') {
            const response = nextMsg.content.toLowerCase().trim();
            if (['yes', 'yes.', 'correct', 'correct.', 'yeah', 'yeah.', 'yep', 'yep.'].includes(response) || response.includes("that's right")) {
              const expectedEmail = parseEmailFromReadback(msg.content);
              if (expectedEmail) {
                testCases.push({
                  call,
                  readback: msg.content,
                  expectedEmail,
                  time: new Date(call.start_timestamp).toLocaleString("en-US", { timeZone: "America/New_York" })
                });
              }
              break;
            }
          }
        }
      }
    }
  }

  console.log(`Found ${testCases.length} calls with confirmed email readbacks\n`);
  console.log("=".repeat(60));
  console.log("TESTING EXTRACTION ACCURACY");
  console.log("=".repeat(60) + "\n");

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`[${i + 1}/${testCases.length}] ${tc.time}`);
    console.log(`  Readback: "${tc.readback.substring(0, 70)}..."`);
    console.log(`  Expected: ${tc.expectedEmail}`);

    try {
      const result = await extractAllCallData(tc.call.transcript_object, "Insurance");
      const extracted = result.email;

      if (extracted === tc.expectedEmail) {
        console.log(`  Extracted: ${extracted} ✅`);
        passed++;
      } else {
        console.log(`  Extracted: ${extracted} ❌`);
        failed++;
        failures.push({
          time: tc.time,
          readback: tc.readback,
          expected: tc.expectedEmail,
          got: extracted
        });
      }
    } catch (err) {
      console.log(`  ERROR: ${err.message} ❌`);
      failed++;
      failures.push({
        time: tc.time,
        readback: tc.readback,
        expected: tc.expectedEmail,
        got: "ERROR: " + err.message
      });
    }
    console.log("");
  }

  console.log("\n" + "=".repeat(60));
  console.log("FINAL RESULTS");
  console.log("=".repeat(60));
  console.log(`Total tests: ${testCases.length}`);
  console.log(`Passed: ${passed} (${((passed / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failed}`);

  if (failures.length > 0) {
    console.log("\n❌ FAILURES:");
    for (const f of failures) {
      console.log(`\n  Time: ${f.time}`);
      console.log(`  Readback: "${f.readback.substring(0, 80)}..."`);
      console.log(`  Expected: ${f.expected}`);
      console.log(`  Got: ${f.got}`);
    }
  }
}

runBigTest().catch(console.error);
