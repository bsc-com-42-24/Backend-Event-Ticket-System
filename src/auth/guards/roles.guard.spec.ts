import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/user-role.enum';
import { AuthenticatedUser } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const createContext = (user?: AuthenticatedUser): ExecutionContext => {
    const handler = jest.fn();
    const controller = jest.fn();

    return {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows access when no role metadata is defined', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext())).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      expect.any(Function),
      expect.any(Function),
    ]);
  });

  it('allows an authenticated user with an allowed role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.EVENT_MANAGER]);
    const context = createContext({
      userId: 'user-id',
      email: 'manager@example.com',
      role: UserRole.EVENT_MANAGER,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies an authenticated user without an allowed role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = createContext({
      userId: 'user-id',
      email: 'customer@example.com',
      role: UserRole.CUSTOMER,
    });

    expect(guard.canActivate(context)).toBe(false);
  });

  it('denies access when the request has no authenticated user', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.CUSTOMER]);

    expect(guard.canActivate(createContext())).toBe(false);
  });
});
