import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

const strict = { whitelist: true, forbidNonWhitelisted: true };

describe('Authentication DTO validation', () => {
  it('accepts valid registration input and trims name and email', async () => {
    const input = plainToInstance(RegisterDto, {
      name: ' Customer ',
      email: ' CUSTOMER@example.com ',
      password: 'correct horse battery',
    });

    await expect(validate(input, strict)).resolves.toHaveLength(0);
    expect(input.name).toBe('Customer');
    expect(input.email).toBe('CUSTOMER@example.com');
  });

  it('rejects ADMIN as a registration role', async () => {
    const input = plainToInstance(RegisterDto, {
      name: 'Customer',
      email: 'customer@example.com',
      password: 'correct horse battery',
      role: 'ADMIN',
    });

    const errors = await validate(input, strict);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'role',
          constraints: expect.objectContaining({
            isIn: 'role must be ATTENDEE or ORGANIZER',
          }),
        }),
      ]),
    );
  });

  it('rejects CHECK_IN_STAFF as a registration role', async () => {
    const input = plainToInstance(RegisterDto, {
      name: 'Customer',
      email: 'customer@example.com',
      password: 'correct horse battery',
      role: 'CHECK_IN_STAFF',
    });

    const errors = await validate(input, strict);

    expect(errors.map(({ property }) => property)).toContain('role');
  });

  it('accepts ATTENDEE, ORGANIZER or no role', async () => {
    for (const role of ['ATTENDEE', 'ORGANIZER', undefined]) {
      const input = plainToInstance(RegisterDto, {
        name: 'Customer',
        email: 'customer@example.com',
        password: 'correct horse battery',
        role,
      });

      await expect(validate(input, strict)).resolves.toHaveLength(0);
    }
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