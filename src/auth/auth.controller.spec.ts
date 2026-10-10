import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserRole } from '../users/user-role.enum';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthResponse } from './auth.types';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './jwt.strategy';

const JWT_SECRET = 'test-only-secret-that-is-at-least-32-characters';

describe('AuthController (HTTP)', () => {
  let app: INestApplication;
  let storedUser: Record<string, unknown> | null;
  let usersService: {
    create: jest.Mock;
    findByEmail: jest.Mock;
  };

  beforeEach(async () => {
    storedUser = null;
    usersService = {
      create: jest.fn((input: Record<string, unknown>) => {
        storedUser = {
          id: '6be610c4-62d6-47a3-9f17-83cba9ef58b6',
          ...input,
          role: UserRole.CUSTOMER,
        };
        return storedUser;
      }),
      findByEmail: jest.fn((email: string) =>
        storedUser?.email === email ? storedUser : null,
      ),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AuthController],
      providers: [
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: JWT_SECRET }),
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => JWT_SECRET },
        },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('registers, logs in, and accepts the issued token on /auth/me', async () => {
    const credentials = {
      name: 'Customer',
      email: 'customer@example.com',
      password: 'correct horse battery',
    };

    const registration = await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send(credentials)
      .expect(201);

    const registrationBody = registration.body as {
      user: AuthResponse['user'];
    };
    expect(registrationBody.user).toEqual({
      id: '6be610c4-62d6-47a3-9f17-83cba9ef58b6',
      name: 'Customer',
      email: 'customer@example.com',
      role: UserRole.CUSTOMER,
    });
    expect(storedUser?.passwordHash).not.toBe(credentials.password);

    const login = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(201);

    const loginBody = login.body as AuthResponse;
    expect(loginBody.tokenType).toBe('Bearer');
    await request(app.getHttpServer() as App)
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .expect(200)
      .expect({
        userId: '6be610c4-62d6-47a3-9f17-83cba9ef58b6',
        email: credentials.email,
        role: UserRole.CUSTOMER,
      });
  });

  it('rejects invalid registration input and client-supplied roles', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({ name: 'Customer', email: 'invalid', password: 'short' })
      .expect(400);

    await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        name: 'Customer',
        email: 'customer@example.com',
        password: 'correct horse battery',
        role: UserRole.ADMIN,
      })
      .expect(400);

    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('rejects invalid credentials and missing or invalid bearer tokens', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email: 'missing@example.com', password: 'wrong password' })
      .expect(401);

    await request(app.getHttpServer() as App)
      .get('/auth/me')
      .expect(401);
    await request(app.getHttpServer() as App)
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });
});
