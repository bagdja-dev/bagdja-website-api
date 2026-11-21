/**
 * Skema dynamic-config Traefik (file provider) — port dari
 * bagdja-bookpedia-api / bagdja-auction-api. Bukan kontrak API publik,
 * jangan expose ke Swagger. `services` didefinisikan ulang di sini
 * (self-contained), bukan referensi cross-provider `nama@file` — lihat
 * plan/architecture/custom-domain-setup.md §1.2 & §4.5.
 */
export interface TraefikDynamicConfig {
  http: {
    routers: Record<string, TraefikRouterConfig>;
    services: Record<string, TraefikServiceConfig>;
  };
}

export interface TraefikRouterConfig {
  rule: string;
  entryPoints: string[];
  /** Selalu objek kosong — SENGAJA tanpa `certResolver`: TLS publik ditangani Cloudflare milik tenant (mode SSL "Full"). */
  tls: Record<string, never>;
  service: string;
}

export interface TraefikServiceConfig {
  loadBalancer: {
    passHostHeader: true;
    servers: { url: string }[];
  };
}

/**
 * Serialisasi YAML manual (tanpa dependency `js-yaml`) — bentuknya sempit
 * dan pasti. Nilai string di-quote single-quote YAML; nilai yang masuk ke
 * sini sudah divalidasi (hostname & URL) oleh `DomainsService`.
 */
export function toTraefikYaml(config: TraefikDynamicConfig): string {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const lines: string[] = ['http:', '  routers:'];

  for (const [name, router] of Object.entries(config.http.routers)) {
    lines.push(`    ${name}:`);
    lines.push(`      rule: ${quote(router.rule)}`);
    lines.push('      entryPoints:');
    for (const entryPoint of router.entryPoints) lines.push(`        - ${entryPoint}`);
    lines.push('      tls: {}');
    lines.push(`      service: ${router.service}`);
  }
  if (Object.keys(config.http.routers).length === 0) {
    lines.push('    {}');
  }

  lines.push('  services:');
  for (const [name, service] of Object.entries(config.http.services)) {
    lines.push(`    ${name}:`);
    lines.push('      loadBalancer:');
    lines.push('        passHostHeader: true');
    lines.push('        servers:');
    for (const server of service.loadBalancer.servers) {
      lines.push(`          - url: ${quote(server.url)}`);
    }
  }
  if (Object.keys(config.http.services).length === 0) {
    lines.push('    {}');
  }

  return lines.join('\n') + '\n';
}
