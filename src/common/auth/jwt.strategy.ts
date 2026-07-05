import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UserService } from '../../modules/user/user.service';

export interface AuthUser {
  userId: string;
  email?: string;
  username?: string;
}

interface JwtPayload {
  sub: string;
  email?: string;
  username?: string;
  type?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('auth_token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'default-secret',
      passReqToCallback: true,
    });
  }

  async validate(req: { headers?: Record<string, string | string[] | undefined> }, payload: JwtPayload): Promise<AuthUser> {
    if (payload.type === 'client_app') {
      throw new UnauthorizedException('Client app tokens cannot be used for user authentication');
    }

    const authUser: AuthUser = {
      userId: payload.sub,
      email: payload.email,
      username: payload.username,
    };

    await this.userService.upsertUser(authUser, req);

    return authUser;
  }
}
