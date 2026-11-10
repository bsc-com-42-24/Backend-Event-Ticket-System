// Creates the demo accounts the React login page lists (admin cannot be created through
// the API on purpose). Safe to re-run. Run it from the backend folder:
//   node scripts/seed-demo-accounts.mjs
// Optional: SEED_PASSWORD=... SEED_ADMIN_PASSWORD=... node scripts/seed-demo-accounts.mjs
// Re-run it after the organizer creates events so the staff account can scan them.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';

try { await import('dotenv/config'); } catch { /* .env is optional */ }

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to seed demo accounts when NODE_ENV=production (use --force to override).');
  process.exit(1);
}

// No shared default password: set SEED_PASSWORD / SEED_ADMIN_PASSWORD, or random ones are printed once.
const password = process.env.SEED_PASSWORD || randomBytes(9).toString('base64url');
const adminPassword = process.env.SEED_ADMIN_PASSWORD || randomBytes(9).toString('base64url');
const ACCOUNTS = [
  { name: 'Platform Admin', email: 'admin@example.com', role: 'ADMIN', password: adminPassword },
  { name: 'Nyasa Events', email: 'organizer@example.com', role: 'ORGANIZER', password },
  { name: 'Gate Staff', email: 'staff@example.com', role: 'CHECK_IN_STAFF', password },
  { name: 'Chimwemwe Banda', email: 'customer@example.com', role: 'ATTENDEE', password },
];

const client = new pg.Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'ticket_master',
});

await client.connect();
try {
  for (const account of ACCOUNTS) {
    const hash = await bcrypt.hash(account.password, 12);
    await client.query(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING',
      [account.name, account.email, hash, account.role],
    );
  }

  const { rows } = await client.query(
    'SELECT user_id, email, role FROM users WHERE email = ANY($1)',
    [ACCOUNTS.map((a) => a.email)],
  );
  const byEmail = Object.fromEntries(rows.map((r) => [r.email, r]));
  const organizer = byEmail['organizer@example.com'];
  const staff = byEmail['staff@example.com'];

  if (organizer && staff && organizer.role === 'ORGANIZER' && staff.role === 'CHECK_IN_STAFF') {
    await client.query(
      'INSERT INTO organizer_staff (staff_user_id, organizer_user_id) VALUES ($1, $2) ON CONFLICT (staff_user_id) DO NOTHING',
      [staff.user_id, organizer.user_id],
    );
    const assigned = await client.query(
      'INSERT INTO staff_event_assignments (staff_user_id, event_id) SELECT $1, event_id FROM events WHERE organizer_id = $2 ON CONFLICT DO NOTHING',
      [staff.user_id, organizer.user_id],
    );
    console.log('Gate staff assigned to ' + assigned.rowCount + ' new event(s) of organizer@example.com.');
  }

  console.log('\nDemo accounts (existing accounts keep their current password):');
  for (const account of ACCOUNTS) {
    const row = byEmail[account.email];
    const note = row && row.role !== account.role ? '  (already existed with role ' + row.role + ')' : '';
    console.log('  ' + account.role.padEnd(15) + account.email + note);
  }
  console.log('\nPassword for newly created accounts: ' + password + ' (admin: ' + adminPassword + ')');
  console.log('Write these down now: they are not stored anywhere else.');
} finally {
  await client.end();
}
