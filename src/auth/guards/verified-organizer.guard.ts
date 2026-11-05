import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

@Injectable()
export class VerifiedOrganizerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required.');
    }

    if (user.role === 'ADMIN') {
      return true;
    }

    if (!user.isVerified) {
      throw new ForbiddenException('Your organizer profile has not been verified by an administrator.');
    }

    return true;
  }
}
