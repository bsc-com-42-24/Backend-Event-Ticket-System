import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
        createdAt: true,
        updatedAt: true,
      },
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

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
