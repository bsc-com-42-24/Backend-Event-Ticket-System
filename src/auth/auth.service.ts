import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { QueryFailedError } from 'typeorm';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponse, JwtPayload } from './auth.types';

const BCRYPT_SALT_ROUNDS = 12;
const BCRYPT_MAX_PASSWORD_BYTES = 72;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: RegisterDto): Promise<AuthResponse> {
    if (Buffer.byteLength(input.password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES) {
      throw new BadRequestException('Password is too long');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    try {
      const user = await this.usersService.create({
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        passwordHash,
      });

      return this.createAuthResponse(user);
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException('Email is already registered');
      }

      throw error;
    }
  }

  async login(input: LoginDto): Promise<AuthResponse> {
    if (Buffer.byteLength(input.password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.usersService.findByEmail(input.email);
    const passwordMatches = user
      ? await bcrypt.compare(input.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createAuthResponse(user);
  }

  private async createAuthResponse(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    return (error.driverError as { code?: string }).code === '23505';
  }
}