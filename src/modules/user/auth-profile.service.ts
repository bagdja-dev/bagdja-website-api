import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthUser } from '../../common/auth/jwt.strategy';

interface AuthMeResponse {
  user?: {
    id?: string;
    sub?: string;
    email?: string;
    username?: string;
    preferred_username?: string;
    name?: string;
    full_name?: string;
  };
  id?: string;
  sub?: string;
  email?: string;
  username?: string;
  preferred_username?: string;
  name?: string;
  full_name?: string;
}

@Injectable()
export class AuthProfileService {
  private readonly logger = new Logger(AuthProfileService.name);
  private readonly authServiceUrl: string;
  private readonly clientAppId: string;
  private readonly clientAppSecret: string;
  private clientToken: string | null = null;
  private clientTokenExpiry: Date | null = null;

  constructor(private readonly config: ConfigService) {
    this.authServiceUrl = (
      config.get<string>('BAGDJA_AUTH_API') ??
      config.get<string>('BAGDJA_AUTH_URL') ??
      'http://localhost:4001'
    ).replace(/\/$/, '');
    this.clientAppId = config.get<string>('CLIENT_APP_ID') ?? '';
    this.clientAppSecret = config.get<string>('CLIENT_APP_SECRET') ?? '';
  }

  /**
   * Validate bearer token via bagdja-auth /auth/me and return AuthUser.
   */
  async validateToken(authorization: string): Promise<AuthUser | null> {
    try {
      const clientToken = await this.getClientToken();
      if (!clientToken) {
        this.logger.warn('Cannot validate token: client credentials not configured');
        return null;
      }

      const res = await fetch(`${this.authServiceUrl}/auth/me`, {
        headers: {
          Authorization: authorization,
          'x-api-token': clientToken,
        },
      });

      if (!res.ok) {
        this.logger.warn(`auth/me returned ${res.status}`);
        return null;
      }

      const data = (await res.json()) as AuthMeResponse;
      const user = data.user ?? data;

      const userId = user.id ?? user.sub;
      if (!userId) return null;

      return {
        userId,
        email: user.email,
        username: user.username ?? user.preferred_username,
      };
    } catch (error) {
      this.logger.warn(`Token validation failed: ${(error as Error).message}`);
      return null;
    }
  }

  async fetchProfile(req: { headers?: Record<string, string | string[] | undefined> }): Promise<AuthMeResponse | null> {
    const authHeader = req.headers?.authorization;
    if (!authHeader) return null;

    const authorization = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    try {
      const clientToken = await this.getClientToken();
      if (!clientToken) return null;

      const res = await fetch(`${this.authServiceUrl}/auth/me`, {
        headers: {
          Authorization: authorization,
          'x-api-token': clientToken,
        },
      });

      if (!res.ok) return null;
      return (await res.json()) as AuthMeResponse;
    } catch {
      return null;
    }
  }

  private async getClientToken(): Promise<string | null> {
    if (this.clientToken && this.clientTokenExpiry && new Date() < this.clientTokenExpiry) {
      return this.clientToken;
    }

    if (!this.clientAppId || !this.clientAppSecret) {
      return null;
    }

    try {
      const res = await fetch(`${this.authServiceUrl}/auth/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: this.clientAppId,
          app_secret: this.clientAppSecret,
        }),
      });

      if (!res.ok) return null;

      const data = (await res.json()) as { 'x-api-token'?: string; expires_in?: number };
      const token = data['x-api-token'];
      if (!token) return null;

      this.clientToken = token;
      this.clientTokenExpiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
      return token;
    } catch {
      return null;
    }
  }
}
