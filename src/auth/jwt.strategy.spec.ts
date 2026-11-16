import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '../users/user-role.enum';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const usersService = { findAuthStateById: jest.fn() };
  const config = { getOrThrow: jest.fn().mockReturnValue('x'.repeat(32)) };
  const payload = { sub: '31', email: 'old@example.com', role: UserRole.VALIDATOR };
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(config as any, usersService as any);
  });

  it('accepts an active account and uses its current role from the database', async () => {
    usersService.findAuthStateById.mockResolvedValue({
      id: '31',
      email: 'new@example.com',
      role: UserRole.EVENT_MANAGER,
      isActive: true,
    });

    await expect(strategy.validate(payload)).resolves.toEqual({
      userId: '31',
      email: 'new@example.com',
      role: UserRole.EVENT_MANAGER,
    });
  });

  it('rejects a token whose account has been deactivated', async () => {
    usersService.findAuthStateById.mockResolvedValue({
      id: '31',
      email: 'old@example.com',
      role: UserRole.VALIDATOR,
      isActive: false,
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token whose account no longer exists', async () => {
    usersService.findAuthStateById.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
