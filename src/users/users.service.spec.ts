import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from './user-role.enum';
import { User } from './user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const repository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
  };
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(repository as never);
  });

  it('forbids an administrator from changing their own role', async () => {
    await expect(
      service.updateRole('12', UserRole.CUSTOMER, '12'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.findOne).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("updates another user's role", async () => {
    const target = { id: '13', role: UserRole.CUSTOMER } as User;
    repository.findOne.mockResolvedValue(target);
    repository.save.mockImplementation(async (user: User) => user);

    const result = await service.updateRole('13', UserRole.VALIDATOR, '12');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: '13' },
    });
    expect(result.role).toBe(UserRole.VALIDATOR);
    expect(repository.save).toHaveBeenCalledWith(target);
  });

  it('returns not found when the target user does not exist', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.updateRole('13', UserRole.ADMIN, '12'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('returns paginated users filtered by email without password hashes', async () => {
    const user = {
      id: '13',
      name: 'User',
      email: 'user@example.com',
      role: UserRole.CUSTOMER,
    };
    repository.findAndCount.mockResolvedValue([[user], 21]);

    const result = await service.findAll({
      page: 2,
      limit: 10,
      email: 'Example.com',
    });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: expect.objectContaining({ value: '%Example.com%' }) },
        skip: 10,
        take: 10,
      }),
    );
    expect(result).toEqual({
      data: [user],
      total: 21,
      page: 2,
      limit: 10,
      totalPages: 3,
    });
    expect(result.data[0]).not.toHaveProperty('passwordHash');
  });
});
