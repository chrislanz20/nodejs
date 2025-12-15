// Accuracy test against manually verified data
require("dotenv").config({ path: ".env.local" });
const { extractAllCallData } = require("./lib/extractAllCallData");
const Retell = require("retell-sdk").default;
const client = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Manually verified correct values from transcripts
const expectedValues = {
  "12:16": { email: "geicoclaims@geico.com", claim: "0355379490101037", client: "Abdullah Yesilkam" },
  "11:50": { email: "dtabet@igeaneuro.com", claim: null, client: "Smith" },
  "10:46": { email: "geicoclaims@geico.com", claim: "8792442360000001", client: null },
  "10:29": { email: "magalys1114@yahoo.com", claim: null, client: null },
};

async function runAccuracyTest() {
  const calls = await client.call.list({ limit: 30 });

  console.log("=== ACCURACY TEST: AI vs MANUALLY VERIFIED ===\n");

  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const call of calls) {
    const estTime = new Date(call.start_timestamp).toLocaleString("en-US", { timeZone: "America/New_York" });

    // Find matching expected values
    let expected = null;
    let timeKey = null;
    for (const [time, vals] of Object.entries(expectedValues)) {
      if (estTime.includes(time)) {
        expected = vals;
        timeKey = time;
        break;
      }
    }

    if (!expected) continue;

    console.log(`\n--- Testing call at ${timeKey} ---`);

    const result = await extractAllCallData(call.transcript_object, "Insurance");

    // Test email
    if (expected.email) {
      totalTests++;
      if (result.email === expected.email) {
        console.log(`  Email: ✅ "${result.email}"`);
        passed++;
      } else {
        console.log(`  Email: ❌ Got "${result.email}" but expected "${expected.email}"`);
        failed++;
        failures.push({ time: timeKey, field: "email", got: result.email, expected: expected.email });
      }
    }

    // Test claim
    if (expected.claim) {
      totalTests++;
      if (result.claim_number === expected.claim) {
        console.log(`  Claim: ✅ "${result.claim_number}"`);
        passed++;
      } else {
        console.log(`  Claim: ❌ Got "${result.claim_number}" but expected "${expected.claim}"`);
        failed++;
        failures.push({ time: timeKey, field: "claim", got: result.claim_number, expected: expected.claim });
      }
    }

    // Test client name
    if (expected.client) {
      totalTests++;
      const gotClient = result.client_name || result.case_name;
      if (gotClient && gotClient.toLowerCase().includes(expected.client.toLowerCase())) {
        console.log(`  Client: ✅ "${gotClient}"`);
        passed++;
      } else {
        console.log(`  Client: ❌ Got "${gotClient}" but expected "${expected.client}"`);
        failed++;
        failures.push({ time: timeKey, field: "client", got: gotClient, expected: expected.client });
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("FINAL RESULTS");
  console.log("=".repeat(50));
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${passed} (${((passed/totalTests)*100).toFixed(1)}%)`);
  console.log(`Failed: ${failed}`);

  if (failures.length > 0) {
    console.log("\nFAILURES:");
    for (const f of failures) {
      console.log(`  ${f.time} ${f.field}: got "${f.got}" expected "${f.expected}"`);
    }
  }
}

runAccuracyTest().catch(console.error);
