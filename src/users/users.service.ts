import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { ILike, Repository } from 'typeorm';
import { UserRole } from './user-role.enum';
import { User } from './user.entity';

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}

export interface ListUsersOptions {
  page: number;
  limit: number;
  email?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  create(input: CreateUserInput): Promise<User> {
    const user = this.usersRepository.create({
      ...input,
      email: this.normalizeEmail(input.email),
    });

    return this.usersRepository.save(user);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: this.normalizeEmail(email) },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Current role and status straight from the database, used on every
   * authenticated request so a deactivated or re-roled account takes effect
   * immediately instead of when its token expires.
   */
  findAuthStateById(
    id: string,
  ): Promise<Pick<User, 'id' | 'email' | 'role' | 'isActive'> | null> {
    return this.usersRepository.findOne({
      where: { id },
      select: { id: true, email: true, role: true, isActive: true },
    });
  }

  async findAll(input: ListUsersOptions) {
    const email = input.email?.trim();
    const [users, total] = await this.usersRepository.findAndCount({
      where: email ? { email: ILike(`%${email}%`) } : {},
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    });

    return {
      data: users,
      total,
      page: input.page,
      limit: input.limit,
      totalPages: Math.ceil(total / input.limit),
    };
  }

  async updateRole(
    targetUserId: string,
    role: UserRole,
    requestingUserId: string,
  ): Promise<User> {
    if (targetUserId === requestingUserId) {
      throw new ForbiddenException(
        'Administrators cannot change their own role',
      );
    }

    const user = await this.usersRepository.findOne({
      where: { id: targetUserId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.role = role;
    return this.usersRepository.save(user);
  }

  async createManagedUser(input: { name: string; email: string; password: string; role: UserRole }) {
    const email = this.normalizeEmail(input.email);
    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email is already registered');
    if (Buffer.byteLength(input.password, 'utf8') > 72) throw new BadRequestException('Password is too long');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = this.usersRepository.create({
      name: input.name.trim(), email, passwordHash, role: input.role, isActive: true,
    });
    const saved = await this.usersRepository.save(user);
    const { passwordHash: _secret, ...safe } = saved as User & { passwordHash?: string };
    return safe;
  }

  async setAccountStatus(targetUserId: string, isActive: boolean, requestingUserId: string) {
    if (targetUserId === requestingUserId) throw new ForbiddenException('Administrators cannot disable their own account');
    const user = await this.usersRepository.findOne({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = isActive;
    const saved = await this.usersRepository.save(user);
    const { passwordHash: _secret, ...safe } = saved as User & { passwordHash?: string };
    return safe;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
