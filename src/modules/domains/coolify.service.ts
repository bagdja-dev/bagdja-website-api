import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BagdjaLogger } from '@bagdja/node-sdk';

interface CoolifyApplication {
  uuid: string;
  domains?: string;
}

/**
 * Wraps Coolify's Application API to register/deregister tenant custom
 * domains on the `bagdja-website-web` app resource — Coolify then handles
 * Traefik reconfiguration + Let's Encrypt cert issuance for that domain.
 *
 * Reads the full domain list before writing (rather than assuming a
 * partial-add works) since Coolify's domain-update API has known flakiness
 * reports (coollabsio/coolify#4326, #4999).
 */
@Injectable()
export class CoolifyService {
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly appUuid: string;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: BagdjaLogger,
  ) {
    this.apiUrl = (this.config.get<string>('COOLIFY_API_URL') ?? '').replace(/\/$/, '');
    this.apiToken = this.config.get<string>('COOLIFY_API_TOKEN') ?? '';
    this.appUuid = this.config.get<string>('COOLIFY_WEB_APP_UUID') ?? '';
  }

  private get isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiToken && this.appUuid);
  }

  private toFqdn(domain: string): string {
    return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  }

  private async getCurrentDomains(): Promise<string[]> {
    const res = await fetch(`${this.apiUrl}/api/v1/applications/${this.appUuid}`, {
      headers: { Authorization: `Bearer ${this.apiToken}` },
    });
    if (!res.ok) {
      throw new Error(`Coolify GET application failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as CoolifyApplication;
    return (data.domains ?? '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
  }

  private async setDomains(domains: string[]): Promise<void> {
    const res = await fetch(`${this.apiUrl}/api/v1/applications/${this.appUuid}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domains: domains.join(',') }),
    });
    if (!res.ok) {
      throw new Error(`Coolify PATCH application failed: ${res.status} ${await res.text()}`);
    }
  }

  /** Returns true on success (including the unconfigured no-op case — there's nothing to fail locally). */
  async addDomain(domain: string): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.bagdjaLog('warn', 'CoolifyService not configured — skipping domain registration', {
        data: { domain },
        tags: ['coolify', 'domain-add-skipped'],
      });
      return true;
    }
    try {
      const fqdn = this.toFqdn(domain);
      const current = await this.getCurrentDomains();
      if (!current.includes(fqdn)) {
        await this.setDomains([...current, fqdn]);
      }
      this.logger.bagdjaLog('info', 'Domain registered with Coolify', {
        data: { domain },
        tags: ['coolify', 'domain-added'],
      });
      return true;
    } catch (err) {
      this.logger.bagdjaLog('error', 'CoolifyService.addDomain failed', {
        data: { error: err instanceof Error ? err.message : err, domain },
        tags: ['coolify', 'domain-add-failed'],
      });
      return false;
    }
  }

  /** Best-effort; failures are logged but never block the caller (removal is not security-sensitive). */
  async removeDomain(domain: string): Promise<boolean> {
    if (!this.isConfigured) return true;
    try {
      const fqdn = this.toFqdn(domain);
      const current = await this.getCurrentDomains();
      const next = current.filter((d) => d !== fqdn);
      if (next.length !== current.length) {
        await this.setDomains(next);
      }
      return true;
    } catch (err) {
      this.logger.bagdjaLog('error', 'CoolifyService.removeDomain failed', {
        data: { error: err instanceof Error ? err.message : err, domain },
        tags: ['coolify', 'domain-remove-failed'],
      });
      return false;
    }
  }
}
