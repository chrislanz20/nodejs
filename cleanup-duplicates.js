// Clean up duplicate client records in contact_client_associations
// Strategy: Keep record with claim number, use best name spelling, delete duplicates

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

// Duplicates to merge (manually verified)
const mergeActions = [
  // Group 1: Desiree Vega (exact duplicates, neither has claim)
  { keep: 30, delete: [82], reason: 'Exact duplicate' },

  // Group 2: Hameda Siddiqui (exact duplicates)
  { keep: 2, delete: [36], reason: 'Exact duplicate' },

  // Group 3: Italia Brown / Italia Brown Carpenter - DIFFERENT claim numbers
  // These might be different cases or same person with two claims - SKIP

  // Group 4: James Car/Carr (typo, no claims)
  { keep: 14, delete: [13, 79, 9, 59], newName: 'James Carr', reason: 'Typo + duplicates' },

  // Group 5: Jessica Ronnie (exact duplicates)
  { keep: 78, delete: [80], reason: 'Exact duplicate' },

  // Group 6: Jim Smith (exact duplicates)
  { keep: 51, delete: [48], reason: 'Exact duplicate' },

  // Group 7: John Smith (exact duplicates)
  { keep: 53, delete: [49], reason: 'Exact duplicate' },

  // Group 8: Maria Rodriguez - keep one with claim number
  { keep: 55, delete: [64], reason: 'Keep record with claim number' },

  // Group 9: Williams / Rochelle Williams - keep full name with claim
  { keep: 63, delete: [74], reason: 'Keep full name with claim number' }
];

async function cleanupDuplicates(dryRun = true) {
  console.log('='.repeat(80));
  console.log('CLEANUP DUPLICATE CLIENT RECORDS');
  console.log(dryRun ? '(DRY RUN - no changes)' : '(LIVE RUN - changes will be saved)');
  console.log('='.repeat(80));

  try {
    let deleted = 0;
    let updated = 0;

    for (const action of mergeActions) {
      console.log('\n' + action.reason + ':');

      const keepRecord = await pool.query(
        'SELECT id, client_name, claim_number FROM contact_client_associations WHERE id = $1',
        [action.keep]
      );
      if (keepRecord.rows.length > 0) {
        const k = keepRecord.rows[0];
        console.log('  KEEP: ID ' + k.id + ' - "' + k.client_name + '"' + (k.claim_number ? ' [Claim: ' + k.claim_number + ']' : ''));
      }

      for (const delId of action.delete) {
        const delRecord = await pool.query(
          'SELECT id, client_name, claim_number FROM contact_client_associations WHERE id = $1',
          [delId]
        );
        if (delRecord.rows.length > 0) {
          const d = delRecord.rows[0];
          console.log('  DELETE: ID ' + d.id + ' - "' + d.client_name + '"' + (d.claim_number ? ' [Claim: ' + d.claim_number + ']' : ''));
        }
      }

      if (!dryRun) {
        if (action.newName) {
          await pool.query(
            'UPDATE contact_client_associations SET client_name = $1, updated_at = NOW() WHERE id = $2',
            [action.newName, action.keep]
          );
          console.log('  -> Updated name to "' + action.newName + '"');
          updated++;
        }

        for (const delId of action.delete) {
          await pool.query('DELETE FROM contact_client_associations WHERE id = $1', [delId]);
          deleted++;
        }
        console.log('  -> Deleted ' + action.delete.length + ' duplicate(s)');
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log('Actions defined: ' + mergeActions.length);
    if (dryRun) {
      const totalDelete = mergeActions.reduce((sum, a) => sum + a.delete.length, 0);
      console.log('Records that would be deleted: ' + totalDelete);
      console.log('\nThis was a DRY RUN. To apply changes, run with:');
      console.log('   node cleanup-duplicates.js --apply');
    } else {
      console.log('Records deleted: ' + deleted);
      console.log('Records updated: ' + updated);
      console.log('Cleanup complete!');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

const dryRun = !process.argv.includes('--apply');
cleanupDuplicates(dryRun);
