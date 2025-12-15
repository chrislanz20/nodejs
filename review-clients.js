require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const clients = await pool.query(`
    SELECT c.id, c.phone_number, c.preferred_language,
           MAX(CASE WHEN cd.field_name = 'name' THEN cd.field_value END) as name,
           MAX(CASE WHEN cd.field_name = 'email' THEN cd.field_value END) as email,
           MAX(CASE WHEN cd.field_name = 'callback_phone' THEN cd.field_value END) as callback
    FROM callers c
    LEFT JOIN caller_details cd ON c.id = cd.caller_id
    WHERE c.agent_id = 'agent_8e50b96f7e7bb7ce7479219fcc'
    AND c.caller_type = 'existing_client'
    GROUP BY c.id, c.phone_number, c.preferred_language
    ORDER BY c.id
  `);

  console.log('ALL 35 EXISTING CLIENTS:\n');

  let issues = [];

  clients.rows.forEach((c, i) => {
    let flags = [];
    if (!c.name) flags.push('NO NAME');
    else if (c.name.split(' ').length === 1) flags.push('FIRST NAME ONLY');
    if (c.email && c.email.toLowerCase().includes('chicken')) flags.push('ODD EMAIL');

    const status = flags.length > 0 ? ' ⚠️  ' + flags.join(', ') : ' ✅';
    console.log((i+1) + '. ' + (c.name || '(no name)') + status);
    console.log('   Phone: ' + c.phone_number + ' | Lang: ' + c.preferred_language);
    if (c.email) console.log('   Email: ' + c.email);
    console.log('');

    if (flags.length > 0) {
      issues.push({ id: c.id, name: c.name, flags });
    }
  });

  console.log('='.repeat(50));
  console.log('SUMMARY: ' + issues.length + ' records with minor issues');
  if (issues.length > 0) {
    console.log('\nIssues found:');
    issues.forEach(i => {
      console.log('  ID ' + i.id + ': ' + (i.name || 'no name') + ' - ' + i.flags.join(', '));
    });
  }

  await pool.end();
}

check();
