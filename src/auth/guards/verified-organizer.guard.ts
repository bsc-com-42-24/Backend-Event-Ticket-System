import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../users/user-role.enum';

@Injectable()
export class VerifiedOrganizerGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required.');
    }

    if (user.role === UserRole.ADMIN) {
      return true;
    }

    const userId = user.userId ?? user.id;
    const rows: { is_verified: boolean }[] = await this.dataSource.query(
      `SELECT is_verified FROM users WHERE user_id = $1`,
      [userId],
    );

    if (!rows[0] || !rows[0].is_verified) {
      throw new ForbiddenException(
        'Your organizer profile has not been verified by an administrator.',
      );
    }

    return true;
  }
}
