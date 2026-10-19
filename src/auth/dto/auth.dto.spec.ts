import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

describe('Authentication DTO validation', () => {
  it('accepts valid registration input and trims name and email', async () => {
    const input = plainToInstance(RegisterDto, {
      name: ' Customer ',
      email: ' CUSTOMER@example.com ',
      password: 'correct horse battery',
    });

    await expect(
      validate(input, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toHaveLength(0);
    expect(input.name).toBe('Customer');
    expect(input.email).toBe('CUSTOMER@example.com');
  });

  it('rejects client-supplied roles during registration', async () => {
    const input = plainToInstance(RegisterDto, {
      name: 'Customer',
      email: 'customer@example.com',
      password: 'correct horse battery',
      role: 'ADMIN',
    });

    const errors = await validate(input, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'role',
          constraints: { whitelistValidation: 'property role should not exist' },
        }),
      ]),
    );
  });

  it('rejects invalid registration fields', async () => {
    const input = plainToInstance(RegisterDto, {
      name: ' ',
      email: 'not-an-email',
      password: 'short',
    });

    const errors = await validate(input);
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['name', 'email', 'password']),
    );
  });

  it('rejects invalid login credentials input', async () => {
    const input = plainToInstance(LoginDto, {
      email: 'not-an-email',
      password: '',
    });

    const errors = await validate(input);
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
  });
});
