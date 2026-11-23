import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../users/user-role.enum';
import { VerifiedOrganizerGuard } from './verified-organizer.guard';

describe('VerifiedOrganizerGuard', () => {
  let guard: VerifiedOrganizerGuard;
  let dataSource: { query: jest.Mock };

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    guard = new VerifiedOrganizerGuard(dataSource as unknown as DataSource);
  });

  const mockContext = (user?: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  it('allows ADMIN users without querying verification status', async () => {
    const result = await guard.canActivate(
      mockContext({ userId: '1', role: UserRole.ADMIN }),
    );
    expect(result).toBe(true);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('allows verified organizers', async () => {
    dataSource.query.mockResolvedValue([{ is_verified: true }]);
    const result = await guard.canActivate(
      mockContext({ userId: '2', role: UserRole.EVENT_MANAGER }),
    );
    expect(result).toBe(true);
  });

  it('blocks unverified organizers with ForbiddenException', async () => {
    dataSource.query.mockResolvedValue([{ is_verified: false }]);
    await expect(
      guard.canActivate(
        mockContext({ userId: '2', role: UserRole.EVENT_MANAGER }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
