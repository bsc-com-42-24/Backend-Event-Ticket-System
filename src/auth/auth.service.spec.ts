import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { QueryFailedError } from 'typeorm';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: {
    create: jest.Mock;
    findByEmail: jest.Mock;
  };
  let jwtService: {
    signAsync: jest.Mock;
  };

  const user = {
    id: '6be610c4-62d6-47a3-9f17-83cba9ef58b6',
    name: 'Customer',
    email: 'customer@example.com',
    role: UserRole.CUSTOMER,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } as User;

  beforeEach(() => {
    usersService = {
      create: jest.fn(),
      findByEmail: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    };
    authService = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
    );
  });

  it('hashes the password and returns a token without exposing the hash', async () => {
    usersService.create.mockImplementation(async (input: Partial<User>) => ({
      ...user,
      ...input,
    }));

    const result = await authService.register({
      name: ' Customer ',
      email: ' CUSTOMER@EXAMPLE.COM ',
      password: 'correct horse battery',
    });

    const savedInput = usersService.create.mock.calls[0][0] as Partial<User>;
    expect(savedInput.name).toBe('Customer');
    expect(savedInput.email).toBe('customer@example.com');
    expect(savedInput.passwordHash).not.toBe('correct horse battery');
    await expect(
      bcrypt.compare('correct horse battery', savedInput.passwordHash!),
    ).resolves.toBe(true);
    expect(result).toEqual({
      accessToken: 'signed.jwt.token',
      tokenType: 'Bearer',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: UserRole.CUSTOMER,
      },
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate email addresses', async () => {
    const duplicateError = new QueryFailedError('INSERT INTO users', [], {
      code: '23505',
    });
    usersService.create.mockRejectedValue(duplicateError);

    await expect(
      authService.register({
        name: 'Customer',
        email: 'customer@example.com',
        password: 'correct horse battery',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('authenticates a valid password', async () => {
    const passwordHash = await bcrypt.hash('correct horse battery', 4);
    usersService.findByEmail.mockResolvedValue({ ...user, passwordHash });

    const result = await authService.login({
      email: 'customer@example.com',
      password: 'correct horse battery',
    });

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(usersService.findByEmail).toHaveBeenCalledWith(
      'customer@example.com',
    );
  });

  it('rejects invalid credentials with a generic response', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      authService.login({
        email: 'missing@example.com',
        password: 'incorrect password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});