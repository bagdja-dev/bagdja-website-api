import { timingSafeEqual } from 'crypto';

import { Controller, ForbiddenException, Get, Header, Headers, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';

import { DomainsService } from './domains.service';
import { TraefikDynamicConfig, toTraefikYaml } from './dto/traefik-dynamic-config.dto';

/**
 * Endpoint internal untuk cron di HOST Coolify (bukan browser, bukan
 * kontrak publik — tidak masuk Swagger). Mengembalikan satu router Traefik
 * per custom domain website yang sudah terverifikasi. Cron menulis hasil
 * `/yaml` ke `/data/coolify/proxy/dynamic/bagdja-website-custom-domains.yaml`;
 * Traefik membaca ulang file itu tanpa restart/redeploy. Pola sama dengan
 * Auction Market & Bookpedia (plan/architecture/custom-domain-setup.md §3.3).
 *
 * Auth: shared secret `TRAEFIK_PROVIDER_SECRET` lewat header
 * `x-internal-secret` (disarankan) atau query `?token=`.
 */
@ApiExcludeController()
@Controller('api/internal/traefik-config')
export class TraefikConfigController {
  private readonly secret: string;

  constructor(
    private readonly domainsService: DomainsService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('TRAEFIK_PROVIDER_SECRET') || '';
  }

  @Get()
  async getConfig(
    @Query('token') tokenQuery?: string,
    @Headers('x-internal-secret') tokenHeader?: string,
  ): Promise<TraefikDynamicConfig> {
    this.assertAuthorized(tokenHeader || tokenQuery);
    return this.domainsService.buildTraefikDynamicConfig();
  }

  @Get('yaml')
  @Header('Content-Type', 'text/yaml; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async getConfigYaml(
    @Query('token') tokenQuery?: string,
    @Headers('x-internal-secret') tokenHeader?: string,
  ): Promise<string> {
    this.assertAuthorized(tokenHeader || tokenQuery);
    return toTraefikYaml(await this.domainsService.buildTraefikDynamicConfig());
  }

  private assertAuthorized(provided?: string): void {
    if (!this.secret || !provided) throw new ForbiddenException('unauthorized');
    const expected = Buffer.from(this.secret);
    const actual = Buffer.from(provided);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new ForbiddenException('unauthorized');
    }
  }
}
