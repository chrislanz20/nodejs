// Link Claim Numbers to Client Records
// Finds claim numbers from professional caller associations and links them to actual client callers
// Uses name matching with manual verification

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

// Normalize names for comparison
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '') // Remove non-letters
    .replace(/\s+/g, ' ')      // Normalize spaces
    .trim();
}

// Calculate similarity between two names (simple word overlap)
function nameSimilarity(name1, name2) {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return 1.0;

  const words1 = n1.split(' ').filter(w => w.length > 1);
  const words2 = n2.split(' ').filter(w => w.length > 1);

  if (words1.length === 0 || words2.length === 0) return 0;

  // Count matching words
  let matches = 0;
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1 === w2 || w1.includes(w2) || w2.includes(w1)) {
        matches++;
        break;
      }
    }
  }

  return matches / Math.max(words1.length, words2.length);
}

async function linkClaimNumbers(dryRun = true) {
  console.log('='.repeat(80));
  console.log('LINK CLAIM NUMBERS TO CLIENT RECORDS');
  console.log(dryRun ? '(DRY RUN - no changes will be made)' : '(LIVE RUN - changes will be saved)');
  console.log('='.repeat(80));

  try {
    // 1. Get all client associations with claim numbers
    console.log('\n1. Fetching client associations with claim numbers...');
    const associations = await pool.query(`
      SELECT DISTINCT ON (client_name)
        client_name,
        claim_number,
        first_mentioned_call_id
      FROM contact_client_associations
      WHERE claim_number IS NOT NULL AND claim_number != ''
      ORDER BY client_name, created_at DESC
    `);
    console.log(`   Found ${associations.rows.length} unique clients with claim numbers`);

    // 2. Get all existing client callers with their names
    console.log('\n2. Fetching existing client callers...');
    const callers = await pool.query(`
      SELECT
        c.id as caller_id,
        c.phone_number,
        c.caller_type,
        cd.field_value as name
      FROM callers c
      JOIN caller_details cd ON c.id = cd.caller_id
      WHERE c.caller_type = 'existing_client'
        AND cd.field_name = 'name'
        AND cd.valid_until IS NULL
    `);
    console.log(`   Found ${callers.rows.length} existing clients with names`);

    // 3. Match associations to callers
    console.log('\n3. Matching claim numbers to client records...');
    console.log('-'.repeat(80));

    const matches = [];
    const noMatches = [];

    for (const assoc of associations.rows) {
      let bestMatch = null;
      let bestScore = 0;

      for (const caller of callers.rows) {
        const score = nameSimilarity(assoc.client_name, caller.name);
        if (score > bestScore && score >= 0.5) { // Require at least 50% match
          bestScore = score;
          bestMatch = caller;
        }
      }

      if (bestMatch) {
        matches.push({
          assocName: assoc.client_name,
          claimNumber: assoc.claim_number,
          callerId: bestMatch.caller_id,
          callerName: bestMatch.name,
          callerPhone: bestMatch.phone_number,
          matchScore: bestScore,
          sourceCallId: assoc.first_mentioned_call_id
        });
        console.log(`✅ MATCH (${Math.round(bestScore * 100)}%)`);
        console.log(`   Association: "${assoc.client_name}" -> Claim: ${assoc.claim_number}`);
        console.log(`   Caller: "${bestMatch.name}" (ID: ${bestMatch.caller_id}, Phone: ${bestMatch.phone_number})`);
      } else {
        noMatches.push({
          assocName: assoc.client_name,
          claimNumber: assoc.claim_number
        });
        console.log(`❌ NO MATCH: "${assoc.client_name}" (Claim: ${assoc.claim_number})`);
      }
      console.log('');
    }

    // 4. Summary and action
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total claim numbers available: ${associations.rows.length}`);
    console.log(`Matched to existing clients: ${matches.length}`);
    console.log(`No matching client record: ${noMatches.length}`);

    if (matches.length > 0 && !dryRun) {
      console.log('\n4. Saving claim numbers to caller_details...');
      console.log('-'.repeat(80));

      let saved = 0;
      let skipped = 0;

      for (const match of matches) {
        // Check if claim number already exists for this caller
        const existing = await pool.query(`
          SELECT id FROM caller_details
          WHERE caller_id = $1 AND field_name = 'claim_number' AND valid_until IS NULL
        `, [match.callerId]);

        if (existing.rows.length > 0) {
          console.log(`   Skipping ${match.callerName} - already has claim number`);
          skipped++;
          continue;
        }

        // Insert claim number
        await pool.query(`
          INSERT INTO caller_details (caller_id, field_name, field_value, source_call_id, confidence, recorded_at)
          VALUES ($1, 'claim_number', $2, $3, 'high', NOW())
        `, [match.callerId, match.claimNumber, match.sourceCallId]);

        console.log(`   ✅ Saved: ${match.callerName} -> Claim: ${match.claimNumber}`);
        saved++;
      }

      console.log(`\nSaved: ${saved}, Skipped: ${skipped}`);
    }

    if (dryRun && matches.length > 0) {
      console.log('\n⚠️  This was a DRY RUN. To apply changes, run with:');
      console.log('   node link-client-claim-numbers.js --apply');
    }

    // Show clients that couldn't be matched (might need manual entry)
    if (noMatches.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('CLIENTS NEEDING MANUAL ATTENTION');
      console.log('(Professional callers mentioned these clients, but no matching caller record)');
      console.log('='.repeat(80));
      for (const nm of noMatches) {
        console.log(`   ${nm.assocName} -> Claim: ${nm.claimNumber}`);
      }
      console.log('\nThese clients may not have called in themselves yet.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

// Check for --apply flag
const dryRun = !process.argv.includes('--apply');
linkClaimNumbers(dryRun);
