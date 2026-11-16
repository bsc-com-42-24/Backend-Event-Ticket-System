import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { AssignStaffEventsDto } from './dto/assign-staff-events.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { SetStaffActiveDto } from './dto/set-staff-active.dto';
import { OrganizersController } from './organizers.controller';

describe('OrganizersController', () => {
  it('is restricted to organizers', () => {
    expect(Reflect.getMetadata(ROLES_KEY, OrganizersController)).toEqual([
      UserRole.EVENT_MANAGER,
    ]);
  });

  it('delegates to the service using the signed-in organizer’s id', async () => {
    const service = {
      createStaff: jest.fn().mockResolvedValue({ staffId: '31' }),
      listStaff: jest.fn().mockResolvedValue([]),
      assignEvents: jest.fn().mockResolvedValue({}),
      setActive: jest.fn().mockResolvedValue({}),
      removeStaff: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new OrganizersController(service as any);
    const organizer = { userId: '5', email: 'o@example.com', role: 'ORGANIZER' } as any;

    await controller.createStaff({ name: 'A B' } as any, organizer);
    await controller.listStaff(organizer);
    await controller.assignEvents('31', { eventIds: ['7'] }, organizer);
    await controller.setActive('31', { isActive: false }, organizer);
    await controller.removeStaff('31', organizer);

    expect(service.createStaff).toHaveBeenCalledWith('5', { name: 'A B' });
    expect(service.listStaff).toHaveBeenCalledWith('5');
    expect(service.assignEvents).toHaveBeenCalledWith('5', '31', ['7']);
    expect(service.setActive).toHaveBeenCalledWith('5', '31', false);
    expect(service.removeStaff).toHaveBeenCalledWith('5', '31');
  });
});

describe('organizer staff DTOs', () => {
  it('requires a valid name, email and 10+ character password', async () => {
    const bad = plainToInstance(CreateStaffDto, {
      name: 'A',
      email: 'nope',
      password: 'short',
    });
    expect((await validate(bad)).map((e) => e.property).sort()).toEqual([
      'email',
      'name',
      'password',
    ]);

    const good = plainToInstance(CreateStaffDto, {
      name: 'Gate Staff',
      email: 'gate@example.com',
      password: 'a-long-password-1',
    });
    expect(await validate(good)).toHaveLength(0);
  });

  it('accepts event ids as strings or numbers, rejects junk and duplicates', async () => {
    const ok = plainToInstance(AssignStaffEventsDto, { eventIds: [7, '8'] });
    expect(await validate(ok)).toHaveLength(0);
    expect(ok.eventIds).toEqual(['7', '8']);

    for (const eventIds of [['abc'], ['0'], ['7', '7'], 'x', [-1]]) {
      const dto = plainToInstance(AssignStaffEventsDto, { eventIds });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    }
    expect(
      await validate(plainToInstance(AssignStaffEventsDto, { eventIds: [] })),
    ).toHaveLength(0);
  });

  it('requires a boolean isActive', async () => {
    expect(
      await validate(plainToInstance(SetStaffActiveDto, { isActive: 'yes' })),
    ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(SetStaffActiveDto, { isActive: false })),
    ).toHaveLength(0);
  });
});
