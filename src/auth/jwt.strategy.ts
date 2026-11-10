import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser, JwtPayload } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * A valid signature is not enough: the account must still exist and be
   * active. The role is taken from the database, not the token, so role
   * changes and deactivation apply to tokens that were already issued.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersService.findAuthStateById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
