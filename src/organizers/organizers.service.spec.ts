import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, QueryFailedError } from 'typeorm';
import { UserRole } from '../users/user-role.enum';
import { OrganizersService } from './organizers.service';

const staffRow = (over: Record<string, unknown> = {}) => ({
  user_id: '31',
  full_name: 'Gate Staff',
  email: 'gate@example.com',
  role: 'CHECK_IN_STAFF',
  is_active: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  events: [],
  ...over,
});

describe('OrganizersService', () => {
  let service: OrganizersService;

  const manager = {
    create: jest.fn((_entity: unknown, data: object) => ({ ...data })),
    save: jest.fn(),
    query: jest.fn(),
  };
  const dataSource = { transaction: jest.fn(), query: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    manager.query.mockReset();
    manager.save.mockReset();
    dataSource.query.mockReset();
    dataSource.transaction.mockImplementation(
      (cb: (m: typeof manager) => unknown) => cb(manager),
    );

    const module = await Test.createTestingModule({
      providers: [
        OrganizersService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(OrganizersService);
  });

  describe('createStaff', () => {
    const input = {
      name: ' Gate Staff ',
      email: ' Gate@Example.com ',
      password: 'a-long-password-1',
    };

    it('creates a CHECK_IN_STAFF account owned by the organizer, with a hashed password', async () => {
      manager.save.mockImplementation(async (u: object) => ({ ...u, id: '31' }));
      dataSource.query.mockResolvedValueOnce([staffRow()]);

      const result = await service.createStaff('5', input);

      const created = manager.create.mock.calls[0][1] as Record<string, unknown>;
      expect(created).toMatchObject({
        name: 'Gate Staff',
        email: 'gate@example.com',
        role: UserRole.VALIDATOR,
        isActive: true,
      });
      expect(created.passwordHash).not.toBe(input.password);
      expect(String(created.passwordHash)).toMatch(/^\$2[aby]\$/);

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO organizer_staff'),
        ['31', '5'],
      );
      expect(result).toMatchObject({
        staffId: '31',
        email: 'gate@example.com',
        isActive: true,
        events: [],
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('maps a duplicate email to 409', async () => {
      manager.save.mockRejectedValue(
        Object.assign(new QueryFailedError('q', [], new Error('dup')), {
          driverError: { code: '23505' },
        }),
      );

      await expect(service.createStaff('5', input)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects passwords over bcrypt’s 72 byte limit', async () => {
      await expect(
        service.createStaff('5', { ...input, password: 'é'.repeat(40) }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('listStaff', () => {
    it('only queries the calling organizer’s staff', async () => {
      dataSource.query.mockResolvedValueOnce([
        staffRow({ events: [{ eventId: '7', title: 'Gala' }] }),
      ]);

      const result = await service.listStaff('5');

      expect(dataSource.query.mock.calls[0][1]).toEqual(['5']);
      expect(dataSource.query.mock.calls[0][0]).toContain(
        'os.organizer_id = $1',
      );
      expect(result[0].events).toEqual([{ eventId: '7', title: 'Gala' }]);
    });
  });

  describe('assignEvents', () => {
    it('replaces the assignments with the organizer’s own events', async () => {
      manager.query
        .mockResolvedValueOnce([{ staff_id: '31' }]) // ownership lock
        .mockResolvedValueOnce([{ event_id: '7' }, { event_id: '8' }]) // events owned
        .mockResolvedValueOnce([]) // delete
        .mockResolvedValueOnce([]); // insert
      dataSource.query.mockResolvedValueOnce([staffRow()]);

      await service.assignEvents('5', '31', ['7', '8', '7']); // duplicate ignored

      expect(manager.query.mock.calls[1][1]).toEqual(['5', ['7', '8']]);
      expect(manager.query.mock.calls[3][1]).toEqual(['31', ['7', '8']]);
    });

    it('refuses events that do not belong to the organizer and changes nothing', async () => {
      manager.query
        .mockResolvedValueOnce([{ staff_id: '31' }])
        .mockResolvedValueOnce([{ event_id: '7' }]); // 99 is someone else's

      await expect(
        service.assignEvents('5', '31', ['7', '99']),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(manager.query).toHaveBeenCalledTimes(2); // no DELETE / INSERT
    });

    it('404s for staff owned by another organizer', async () => {
      manager.query.mockResolvedValueOnce([]);

      await expect(
        service.assignEvents('5', '31', ['7']),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(manager.query).toHaveBeenCalledTimes(1);
    });

    it('an empty list clears all assignments', async () => {
      manager.query
        .mockResolvedValueOnce([{ staff_id: '31' }])
        .mockResolvedValueOnce([]); // delete
      dataSource.query.mockResolvedValueOnce([staffRow()]);

      await service.assignEvents('5', '31', []);

      expect(manager.query).toHaveBeenCalledTimes(2); // lock + delete, no insert
    });
  });

  describe('setActive', () => {
    it('toggles only an account owned by this organizer', async () => {
      manager.query
        .mockResolvedValueOnce([{ staff_id: '31' }]) // ownership lock
        .mockResolvedValueOnce([]); // update
      dataSource.query.mockResolvedValueOnce([staffRow({ is_active: false })]);

      const result = await service.setActive('5', '31', false);

      expect(manager.query.mock.calls[1][1]).toEqual(['31', false]);
      expect(result.isActive).toBe(false);
    });

    it('404s and updates nothing when the staff member is not theirs', async () => {
      manager.query.mockResolvedValueOnce([]);

      await expect(
        service.setActive('5', '31', true),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(manager.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeStaff', () => {
    it('removes assignments and ownership and disables the account, never deleting the user', async () => {
      manager.query.mockResolvedValue([{ staff_id: '31' }]);

      await service.removeStaff('5', '31');

      const sql = manager.query.mock.calls.map((c) => String(c[0]));
      expect(sql[1]).toContain('DELETE FROM staff_event_assignments');
      expect(sql[2]).toContain('DELETE FROM organizer_staff');
      expect(sql[3]).toContain('is_active = FALSE');
      expect(sql.some((q) => /DELETE FROM users/i.test(q))).toBe(false);
    });

    it('404s and changes nothing for staff owned by someone else', async () => {
      manager.query.mockResolvedValueOnce([]);

      await expect(service.removeStaff('5', '31')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(manager.query).toHaveBeenCalledTimes(1);
    });
  });
});
