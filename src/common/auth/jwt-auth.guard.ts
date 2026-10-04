import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from '../../modules/user/user.service';
import { AuthProfileService } from '../../modules/user/auth-profile.service';
import type { AuthUser } from './auth-user';

/**
 * Authenticates the end user of website-api.
 *
 * website-api is a third-party product on the Bagdja platform: it must NOT
 * hold platform secrets (no `JWT_SECRET`), so it never verifies tokens with a
 * shared HS256 key (plan/payment-service/caller-identity-hardening-plan.md
 * S19). Order:
 * 1. Stateless verification against bagdja-auth JWKS (EdDSA OAuth access
 *    tokens issued via SSO) — the normal path.
 * 2. Fallback: introspection via bagdja-auth `/auth/me` with the app's own
 *    client token (no secret needed on this side).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly userService: UserService,
    private readonly authProfile: AuthProfileService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Authentication token is required');
    }

    let authUser: AuthUser | null =
      await this.authProfile.validateTokenViaJwks(token);

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
