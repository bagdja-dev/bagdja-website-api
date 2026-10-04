import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from 'jose';
import { AuthProfileService } from '../../modules/user/auth-profile.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('website-api user authentication (S19: JWKS only)', () => {
  let profile: AuthProfileService;
  let sign: (claims: Record<string, unknown>, issuer?: string) => Promise<string>;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
      extractable: true,
    });
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'EdDSA' };
    profile = new AuthProfileService({
      get: () => undefined,
    } as unknown as ConfigService);
    (profile as any).jwks = createLocalJWKSet({ keys: [jwk] });
    sign = (claims, issuer = 'bagdja-auth') =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
        .setIssuer(issuer)
        .setExpirationTime('1h')
        .sign(privateKey);
  });

  describe('AuthProfileService.validateTokenViaJwks', () => {
    it('accepts an EdDSA user token from bagdja-auth', async () => {
      const user = await profile.validateTokenViaJwks(
        await sign({ sub: USER_ID, email: 'u@x.io' }),
      );
      expect(user).toEqual({ userId: USER_ID, email: 'u@x.io', username: undefined });
    });

    it('rejects a client-app token signed by the same key', async () => {
      const token = await sign({ sub: 'bagdja-website', type: 'client_app' });
      expect(await profile.validateTokenViaJwks(token)).toBeNull();
    });

    it('rejects another issuer and HS256 tokens', async () => {
      expect(await profile.validateTokenViaJwks(await sign({ sub: USER_ID }, 'evil'))).toBeNull();
      const hs = await new SignJWT({ sub: USER_ID })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('bagdja-auth')
        .sign(new TextEncoder().encode('any-shared-secret'));
      expect(await profile.validateTokenViaJwks(hs)).toBeNull();
    });
  });

  describe('JwtAuthGuard', () => {
    const contextFor = (request: any) =>
      ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;
    const userService = { upsertUser: jest.fn() };

    it('uses JWKS first and never needs JWT_SECRET', async () => {
      const authProfile = {
        validateTokenViaJwks: jest.fn().mockResolvedValue({ userId: USER_ID }),
        validateToken: jest.fn(),
      };
      const guard = new JwtAuthGuard(userService as any, authProfile as any);
      const request: any = { headers: { authorization: 'Bearer t' } };
      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.user).toEqual({ userId: USER_ID });
      expect(authProfile.validateToken).not.toHaveBeenCalled();
    });

    it('falls back to /auth/me introspection, then rejects', async () => {
      const authProfile = {
        validateTokenViaJwks: jest.fn().mockResolvedValue(null),
        validateToken: jest.fn().mockResolvedValue(null),
      };
      const guard = new JwtAuthGuard(userService as any, authProfile as any);
      await expect(
        guard.canActivate(contextFor({ headers: { authorization: 'Bearer t' } })),
      ).rejects.toThrow(UnauthorizedException);
      expect(authProfile.validateToken).toHaveBeenCalledWith('Bearer t');
    });
  });
});
