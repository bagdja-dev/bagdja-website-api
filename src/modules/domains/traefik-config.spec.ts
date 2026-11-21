import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Repository } from 'typeorm';

import { Website } from '../../entities';
import { UpdateWebsiteDto } from '../websites/dto/update-website.dto';
import { DomainsService, isValidCustomDomain } from './domains.service';
import { toTraefikYaml } from './dto/traefik-dynamic-config.dto';
import { TraefikConfigController } from './traefik-config.controller';

function configOf(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function serviceWith(websites: Partial<Website>[], env: Record<string, string>) {
  const repo = { find: jest.fn().mockResolvedValue(websites) } as unknown as Repository<Website>;
  return { service: new DomainsService(repo, configOf(env)), repo };
}

describe('isValidCustomDomain', () => {
  it.each(['bagdja.com', 'shop.tokosaya.co.id', 'xn--80ak6aa92e.com'])('accepts %s', (domain) => {
    expect(isValidCustomDomain(domain)).toBe(true);
  });

  it.each(['', 'localhost', 'https://bagdja.com', 'Bagdja.com', 'evil.com`) || Host(`x.com', '-bad.com', 'a..com'])(
    'rejects %s',
    (domain) => {
      expect(isValidCustomDomain(domain)).toBe(false);
    },
  );
});

describe('DomainsService.buildTraefikDynamicConfig', () => {
  const env = { WEBSITE_APP_INTERNAL_URL: 'http://bagdja-website-web:5005' };

  it('creates one explicit router per verified domain sharing one service', async () => {
    const { service, repo } = serviceWith(
      [
        { id: '1', slug: 'bagdja', domain: 'Bagdja.com' },
        { id: '2', slug: 'toko', domain: 'shop.toko.id' },
      ],
      env,
    );

    const config = await service.buildTraefikDynamicConfig();

    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ is_active: true }) }));
    expect(config.http.routers).toEqual({
      'website-custom-domain-bagdja': {
        rule: 'Host(`bagdja.com`)',
        entryPoints: ['https'],
        tls: {},
        service: 'website-custom-domain-svc',
      },
      'website-custom-domain-toko': {
        rule: 'Host(`shop.toko.id`)',
        entryPoints: ['https'],
        tls: {},
        service: 'website-custom-domain-svc',
      },
    });
    expect(config.http.services['website-custom-domain-svc'].loadBalancer.servers).toEqual([
      { url: 'http://bagdja-website-web:5005' },
    ]);
  });

  it('skips domains that are not valid hostnames', async () => {
    const { service } = serviceWith([{ id: '1', slug: 'x', domain: 'evil.com`) || PathPrefix(`/' }], env);
    const config = await service.buildTraefikDynamicConfig();
    expect(config).toEqual({ http: { routers: {}, services: {} } });
  });

  it('returns an empty config without querying when the internal URL is missing', async () => {
    const { service, repo } = serviceWith([{ id: '1', slug: 'bagdja', domain: 'bagdja.com' }], {});
    expect(await service.buildTraefikDynamicConfig()).toEqual({ http: { routers: {}, services: {} } });
    expect(repo.find).not.toHaveBeenCalled();
  });
});

describe('toTraefikYaml', () => {
  it('renders routers and services', () => {
    const yaml = toTraefikYaml({
      http: {
        routers: {
          'website-custom-domain-bagdja': {
            rule: 'Host(`bagdja.com`)',
            entryPoints: ['https'],
            tls: {},
            service: 'website-custom-domain-svc',
          },
        },
        services: {
          'website-custom-domain-svc': {
            loadBalancer: { passHostHeader: true, servers: [{ url: 'http://web:5005' }] },
          },
        },
      },
    });

    expect(yaml).toBe(
      [
        'http:',
        '  routers:',
        '    website-custom-domain-bagdja:',
        "      rule: 'Host(`bagdja.com`)'",
        '      entryPoints:',
        '        - https',
        '      tls: {}',
        '      service: website-custom-domain-svc',
        '  services:',
        '    website-custom-domain-svc:',
        '      loadBalancer:',
        '        passHostHeader: true',
        '        servers:',
        "          - url: 'http://web:5005'",
        '',
      ].join('\n'),
    );
  });

  it('renders empty maps when there are no domains', () => {
    expect(toTraefikYaml({ http: { routers: {}, services: {} } })).toBe('http:\n  routers:\n    {}\n  services:\n    {}\n');
  });
});

describe('TraefikConfigController', () => {
  const empty = { http: { routers: {}, services: {} } };
  const domains = { buildTraefikDynamicConfig: jest.fn().mockResolvedValue(empty) } as unknown as DomainsService;

  it('accepts the shared secret via header or query', async () => {
    const controller = new TraefikConfigController(domains, configOf({ TRAEFIK_PROVIDER_SECRET: 's3cret' }));
    await expect(controller.getConfig(undefined, 's3cret')).resolves.toEqual(empty);
    await expect(controller.getConfigYaml('s3cret', undefined)).resolves.toContain('routers:');
  });

  it('rejects a wrong or missing secret', async () => {
    const controller = new TraefikConfigController(domains, configOf({ TRAEFIK_PROVIDER_SECRET: 's3cret' }));
    await expect(controller.getConfig('nope', undefined)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.getConfig(undefined, undefined)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects everything when no secret is configured', async () => {
    const controller = new TraefikConfigController(domains, configOf({}));
    await expect(controller.getConfig('', '')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('UpdateWebsiteDto.domain', () => {
  async function domainErrors(domain: unknown) {
    const dto = plainToInstance(UpdateWebsiteDto, { domain });
    const errors = await validate(dto);
    return { dto, errors: errors.filter((e) => e.property === 'domain') };
  }

  it('normalizes pasted URLs to a bare lowercase hostname', async () => {
    const { dto, errors } = await domainErrors(' https://Bagdja.com/path ');
    expect(errors).toHaveLength(0);
    expect(dto.domain).toBe('bagdja.com');
  });

  it('allows empty string to clear the domain', async () => {
    expect((await domainErrors('')).errors).toHaveLength(0);
  });

  it('rejects values that are not hostnames', async () => {
    expect((await domainErrors('evil.com`) || Host(`x')).errors).toHaveLength(1);
  });
});
