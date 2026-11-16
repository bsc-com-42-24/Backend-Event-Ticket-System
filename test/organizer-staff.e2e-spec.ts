/**
 * End-to-end test of organizer staff management, event-restricted ticket
 * validation and inactive-account enforcement.
 *
 * Needs a real PostgreSQL database (see .env) with the base schema and all
 * migrations applied:  npm run migration:run
 * Run with:            npm run test:e2e
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

jest.setTimeout(60000);

describe('Organizer staff (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  const tag = `${Date.now()}`;
  const password = 'correct-horse-battery';

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function register(name: string, role: 'ORGANIZER' | 'ATTENDEE') {
    const email = `${name.toLowerCase()}.${tag}@example.com`;
    await http().post('/auth/register').send({ name, email, password, role }).expect(201);
    return email;
  }
  async function login(email: string, pw = password) {
    const res = await http().post('/auth/login').send({ email, password: pw });
    return res;
  }
  const userId = async (email: string): Promise<string> =>
    String((await db.query(`SELECT user_id FROM users WHERE email=$1`, [email]))[0].user_id);

  async function makeEvent(organizerId: string, title: string) {
    const [e] = await db.query(
      `INSERT INTO events (organizer_id, title, description, venue, location, capacity, start_at, end_at, status)
       VALUES ($1,$2,'d','v','l',10, now()+interval '1 day', now()+interval '2 day','PUBLISHED')
       RETURNING event_id`,
      [organizerId, title],
    );
    const [tt] = await db.query(
      `INSERT INTO ticket_types (event_id, type_name, price, quantity_total)
       VALUES ($1,'Regular',1000,10) RETURNING ticket_type_id`,
      [e.event_id],
    );
    return { eventId: String(e.event_id), ticketTypeId: String(tt.ticket_type_id) };
  }
  async function makeTicket(ev: { eventId: string; ticketTypeId: string }) {
    const qr = randomUUID();
    await db.query(
      `INSERT INTO tickets (ticket_number, event_id, ticket_type_id, qr_token)
       VALUES ($1,$2,$3,$4)`,
      [`T-${randomUUID().slice(0, 12)}`, ev.eventId, ev.ticketTypeId, qr],
    );
    return qr;
  }
  const ticketStatus = async (qr: string): Promise<string> =>
    (await db.query(`SELECT status FROM tickets WHERE qr_token=$1`, [qr]))[0].status;

  const scan = (token: string, qrToken: string, eventId?: string) =>
    http().post('/tickets/validate').set(auth(token)).send({ qrToken, eventId });

  let orgA: string, orgB: string, orgAEmail: string, orgBEmail: string;
  let tokA: string, tokB: string;
  let evA1: { eventId: string; ticketTypeId: string };
  let evA2: typeof evA1, evB1: typeof evA1;
  const emails: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    db = app.get(DataSource);

    orgAEmail = await register('orgA', 'ORGANIZER');
    orgBEmail = await register('orgB', 'ORGANIZER');
    emails.push(orgAEmail, orgBEmail);
    orgA = await userId(orgAEmail);
    orgB = await userId(orgBEmail);
    tokA = (await login(orgAEmail)).body.accessToken;
    tokB = (await login(orgBEmail)).body.accessToken;
    evA1 = await makeEvent(orgA, `A1 ${tag}`);
    evA2 = await makeEvent(orgA, `A2 ${tag}`);
    evB1 = await makeEvent(orgB, `B1 ${tag}`);
  });

  afterAll(async () => {
    try {
      const ids = (
        await db.query(`SELECT user_id FROM users WHERE email LIKE $1`, [`%.${tag}@example.com`])
      ).map((r: { user_id: string }) => r.user_id);
      await db.query(`DELETE FROM ticket_validations WHERE checked_by = ANY($1::bigint[])`, [ids]);
      await db.query(
        `DELETE FROM tickets WHERE event_id IN (SELECT event_id FROM events WHERE organizer_id = ANY($1::bigint[]))`,
        [ids],
      );
      await db.query(
        `DELETE FROM ticket_types WHERE event_id IN (SELECT event_id FROM events WHERE organizer_id = ANY($1::bigint[]))`,
        [ids],
      );
      await db.query(`DELETE FROM events WHERE organizer_id = ANY($1::bigint[])`, [ids]);
      await db.query(`DELETE FROM users WHERE user_id = ANY($1::bigint[])`, [ids]);
    } finally {
      await app.close();
    }
  });

  it('only organizers can use the staff endpoints', async () => {
    await http().get('/organizers/me/staff').expect(401);

    const custEmail = await register('cust', 'ATTENDEE');
    emails.push(custEmail);
    const custTok = (await login(custEmail)).body.accessToken;
    await http().get('/organizers/me/staff').set(auth(custTok)).expect(403);
    await http()
      .post('/organizers/me/staff')
      .set(auth(custTok))
      .send({ name: 'X Y', email: `x.${tag}@example.com`, password })
      .expect(403);
  });

  describe('full staff lifecycle', () => {
    const staffEmail = () => `gate.${tag}@example.com`;
    let staffId: string;
    let staffTok: string;

    it('creates staff, validates input, and rejects a duplicate email', async () => {
      await http()
        .post('/organizers/me/staff')
        .set(auth(tokA))
        .send({ name: 'G', email: 'bad', password: 'short' })
        .expect(400);

      const res = await http()
        .post('/organizers/me/staff')
        .set(auth(tokA))
        .send({ name: 'Gate Staff', email: staffEmail().toUpperCase(), password })
        .expect(201);
      expect(res.body).toMatchObject({
        name: 'Gate Staff',
        email: staffEmail(),
        role: 'CHECK_IN_STAFF',
        isActive: true,
        events: [],
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
      staffId = res.body.staffId;
      emails.push(staffEmail());

      await http()
        .post('/organizers/me/staff')
        .set(auth(tokA))
        .send({ name: 'Dup', email: staffEmail(), password })
        .expect(409);

      staffTok = (await login(staffEmail())).body.accessToken;
      expect(staffTok).toBeDefined();
    });

    it('lists only the organizer’s own staff', async () => {
      const a = await http().get('/organizers/me/staff').set(auth(tokA)).expect(200);
      expect(a.body.map((s: any) => s.staffId)).toEqual([staffId]);
      const b = await http().get('/organizers/me/staff').set(auth(tokB)).expect(200);
      expect(b.body).toEqual([]);
    });

    it('staff cannot validate anything before being assigned (ticket stays unused)', async () => {
      const qr = await makeTicket(evA1);
      const res = await scan(staffTok, qr, evA1.eventId).expect(200);
      expect(res.body).toMatchObject({
        accepted: false,
        reason: 'NOT_ASSIGNED',
        ticketId: null,
        eventId: null,
        details: null,
      });
      expect(await ticketStatus(qr)).toBe('ISSUED');
      // the rejection is written to the audit trail (DB constraint accepts the new reason)
      const rows = await db.query(
        `SELECT reason FROM ticket_validations WHERE checked_by=$1 ORDER BY validation_id DESC LIMIT 1`,
        [staffId],
      );
      expect(rows[0].reason).toBe('NOT_ASSIGNED');
    });

    it('assignment: own events only, replace semantics, other organizers locked out', async () => {
      // another organizer's event
      await http()
        .put(`/organizers/me/staff/${staffId}/events`)
        .set(auth(tokA))
        .send({ eventIds: [evA1.eventId, evB1.eventId] })
        .expect(400);
      // nothing was assigned by the failed attempt
      expect(
        (await http().get('/organizers/me/staff').set(auth(tokA))).body[0].events,
      ).toEqual([]);

      // bad payloads
      await http().put(`/organizers/me/staff/${staffId}/events`).set(auth(tokA)).send({ eventIds: ['x'] }).expect(400);
      await http().put(`/organizers/me/staff/abc/events`).set(auth(tokA)).send({ eventIds: [] }).expect(400);

      // organizer B cannot touch organizer A's staff (looks like "not found")
      await http().put(`/organizers/me/staff/${staffId}/events`).set(auth(tokB)).send({ eventIds: [evB1.eventId] }).expect(404);
      await http().patch(`/organizers/me/staff/${staffId}/active`).set(auth(tokB)).send({ isActive: false }).expect(404);
      await http().delete(`/organizers/me/staff/${staffId}`).set(auth(tokB)).expect(404);

      // valid assignment (numeric ids are accepted too)
      const ok = await http()
        .put(`/organizers/me/staff/${staffId}/events`)
        .set(auth(tokA))
        .send({ eventIds: [Number(evA1.eventId)] })
        .expect(200);
      expect(ok.body.events).toEqual([{ eventId: evA1.eventId, title: `A1 ${tag}` }]);
    });

    it('staff can validate assigned-event tickets only', async () => {
      const qrA1 = await makeTicket(evA1);
      const qrA2 = await makeTicket(evA2); // same organizer, not assigned
      const qrB1 = await makeTicket(evB1); // different organizer

      const good = await scan(staffTok, qrA1, evA1.eventId).expect(200);
      expect(good.body).toMatchObject({
        accepted: true,
        eventId: evA1.eventId,
        details: { ticketType: 'Regular', eventTitle: `A1 ${tag}` },
      });
      expect(await ticketStatus(qrA1)).toBe('USED');

      // scanning it again is the normal ALREADY_USED, not an assignment problem
      expect((await scan(staffTok, qrA1, evA1.eventId)).body.reason).toBe('ALREADY_USED');

      for (const qr of [qrA2, qrB1]) {
        const res = await scan(staffTok, qr).expect(200);
        expect(res.body).toMatchObject({ accepted: false, reason: 'NOT_ASSIGNED', details: null });
        expect(await ticketStatus(qr)).toBe('ISSUED');
      }

      // claiming the assigned event while scanning another event's ticket cannot bypass it
      const spoof = await scan(staffTok, qrA2, evA1.eventId).expect(200);
      expect(spoof.body.reason).toBe('NOT_ASSIGNED');
      expect(await ticketStatus(qrA2)).toBe('ISSUED');

      // assignment replace: swap A1 -> A2, A1 access is gone
      await http().put(`/organizers/me/staff/${staffId}/events`).set(auth(tokA)).send({ eventIds: [evA2.eventId] }).expect(200);
      expect((await scan(staffTok, qrA2)).body.accepted).toBe(true);
      const qrA1b = await makeTicket(evA1);
      expect((await scan(staffTok, qrA1b)).body.reason).toBe('NOT_ASSIGNED');
      // put the A1 assignment back for the remaining tests
      await http().put(`/organizers/me/staff/${staffId}/events`).set(auth(tokA)).send({ eventIds: [evA1.eventId, evA2.eventId] }).expect(200);
      expect((await scan(staffTok, qrA1b)).body.accepted).toBe(true);
    });

    it('admins keep the ability to validate any event', async () => {
      const adminEmail = await register('admin', 'ATTENDEE');
      emails.push(adminEmail);
      await db.query(`UPDATE users SET role='ADMIN' WHERE email=$1`, [adminEmail]);
      const adminTok = (await login(adminEmail)).body.accessToken;
      const qrB1 = await makeTicket(evB1);
      const res = await scan(adminTok, qrB1).expect(200);
      expect(res.body).toMatchObject({ accepted: true, eventId: evB1.eventId });
    });

    it('deactivating staff blocks login, existing tokens and validation immediately', async () => {
      const qr = await makeTicket(evA1);

      const off = await http()
        .patch(`/organizers/me/staff/${staffId}/active`)
        .set(auth(tokA))
        .send({ isActive: false })
        .expect(200);
      expect(off.body.isActive).toBe(false);

      // the token issued BEFORE deactivation no longer works
      await scan(staffTok, qr).expect(401);
      expect(await ticketStatus(qr)).toBe('ISSUED');
      // and the correct password no longer logs in
      const l = await login(staffEmail());
      expect(l.status).toBe(401);
      expect(l.body.accessToken).toBeUndefined();

      await http().patch(`/organizers/me/staff/${staffId}/active`).set(auth(tokA)).send({ isActive: 'no' }).expect(400);

      // reactivating restores access (same old token works again)
      await http().patch(`/organizers/me/staff/${staffId}/active`).set(auth(tokA)).send({ isActive: true }).expect(200);
      expect((await scan(staffTok, qr)).body.accepted).toBe(true);
    });

    it('removing staff revokes access but keeps the user and all history', async () => {
      const validationsBefore = Number(
        (await db.query(`SELECT count(*) c FROM ticket_validations WHERE checked_by=$1`, [staffId]))[0].c,
      );
      const usedBefore = Number(
        (await db.query(`SELECT count(*) c FROM tickets WHERE status='USED' AND event_id = ANY($1::bigint[])`, [[evA1.eventId, evA2.eventId]]))[0].c,
      );
      expect(validationsBefore).toBeGreaterThan(0);
      expect(usedBefore).toBeGreaterThan(0);

      await http().delete(`/organizers/me/staff/${staffId}`).set(auth(tokA)).expect(204);

      const qr = await makeTicket(evA1);
      await scan(staffTok, qr).expect(401);
      expect((await login(staffEmail())).status).toBe(401);
      expect((await http().get('/organizers/me/staff').set(auth(tokA))).body).toEqual([]);
      await http().delete(`/organizers/me/staff/${staffId}`).set(auth(tokA)).expect(404);

      // history intact: user row kept (disabled), audit rows and USED tickets untouched
      const u = await db.query(`SELECT is_active FROM users WHERE user_id=$1`, [staffId]);
      expect(u[0].is_active).toBe(false);
      expect(
        Number((await db.query(`SELECT count(*) c FROM ticket_validations WHERE checked_by=$1`, [staffId]))[0].c),
      ).toBe(validationsBefore);
      expect(
        Number((await db.query(`SELECT count(*) c FROM tickets WHERE status='USED' AND event_id = ANY($1::bigint[])`, [[evA1.eventId, evA2.eventId]]))[0].c),
      ).toBe(usedBefore);
      expect(
        Number((await db.query(`SELECT count(*) c FROM staff_event_assignments WHERE staff_id=$1`, [staffId]))[0].c),
      ).toBe(0);
    });
  });

  it('an unowned CHECK_IN_STAFF account (e.g. created by an admin) cannot validate tickets', async () => {
    const email = `legacy.${tag}@example.com`;
    emails.push(email);
    await db.query(
      `INSERT INTO users (full_name,email,password_hash,role) VALUES ('Legacy',$1,$2,'CHECK_IN_STAFF')`,
      [email, await bcrypt.hash(password, 4)],
    );
    const tok = (await login(email)).body.accessToken;
    const qr = await makeTicket(evA1);
    expect((await scan(tok, qr)).body.reason).toBe('NOT_ASSIGNED');
    expect(await ticketStatus(qr)).toBe('ISSUED');
  });

  it('a deactivated organizer or customer token is rejected everywhere', async () => {
    await db.query(`UPDATE users SET is_active=false WHERE user_id=$1`, [orgB]);
    await http().get('/organizers/me/staff').set(auth(tokB)).expect(401);
    await db.query(`UPDATE users SET is_active=true WHERE user_id=$1`, [orgB]);
    await http().get('/organizers/me/staff').set(auth(tokB)).expect(200);
  });
});
