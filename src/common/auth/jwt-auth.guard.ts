import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

import { UserService } from '../../modules/user/user.service';
import { AuthProfileService } from '../../modules/user/auth-profile.service';
import type { AuthUser } from './jwt.strategy';

interface JwtPayload {
  sub: string;
  email?: string;
  username?: string;
  type?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly userService: UserService,
    private readonly authProfile: AuthProfileService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token is required');
    }

    let authUser = this.verifyLocalJwt(token);

    // Fallback: validate via bagdja-auth /auth/me (works when JWT_SECRET differs, e.g. dev + prod SSO)
    if (!authUser) {
      authUser = await this.authProfile.validateToken(`Bearer ${token}`);
    }

    if (!authUser) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    await this.userService.upsertUser(authUser, request);
    request.user = authUser;
    return true;
  }

  private verifyLocalJwt(token: string): AuthUser | null {
    try {
      const secret = this.config.get<string>('JWT_SECRET') ?? 'default-secret';
      const payload = jwt.verify(token, secret) as JwtPayload;

      if (payload.type === 'client_app') {
        return null;
      }

      return {
        userId: payload.sub,
        email: payload.email,
        username: payload.username,
      };
    } catch {
      return null;
    }
  }

  private extractToken(request: { headers?: Record<string, string | string[] | undefined>; query?: Record<string, string> }): string | null {
    const authHeader = request.headers?.authorization;
    if (authHeader) {
      const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      const [type, token] = header.split(' ');
      if (type === 'Bearer' && token) return token;
    }

    const queryToken = request.query?.auth_token;
    if (queryToken) return queryToken;

    return null;
  }
}
