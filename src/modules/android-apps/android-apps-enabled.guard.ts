import { CanActivate, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AndroidAppsEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    const configured = this.config.get<string>('WEBSITE_ANDROID_APPS_ENABLED');
    const enabled =
      configured === undefined
        ? this.config.get<string>('NODE_ENV') !== 'production'
        : configured.trim().toLowerCase() === 'true';

    if (!enabled) {
      throw new ServiceUnavailableException('Android app changes and builds are disabled');
    }
    return true;
  }
}
