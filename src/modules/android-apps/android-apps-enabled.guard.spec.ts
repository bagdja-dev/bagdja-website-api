import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AndroidAppsEnabledGuard } from './android-apps-enabled.guard';

describe('AndroidAppsEnabledGuard', () => {
  const createGuard = (values: Record<string, string | undefined>) =>
    new AndroidAppsEnabledGuard({
      get: (key: string) => values[key],
    } as ConfigService);

  it('enables the feature by default outside production', () => {
    const guard = createGuard({ NODE_ENV: 'development' });

    expect(guard.canActivate()).toBe(true);
  });

  it('keeps production disabled until explicitly enabled', () => {
    const guard = createGuard({ NODE_ENV: 'production' });

    expect(() => guard.canActivate()).toThrow(ServiceUnavailableException);
  });

  it('allows production rollout when explicitly enabled', () => {
    const guard = createGuard({
      NODE_ENV: 'production',
      WEBSITE_ANDROID_APPS_ENABLED: 'true',
    });

    expect(guard.canActivate()).toBe(true);
  });

  it('supports disabling the feature in every environment', () => {
    const guard = createGuard({
      NODE_ENV: 'development',
      WEBSITE_ANDROID_APPS_ENABLED: 'false',
    });

    expect(() => guard.canActivate()).toThrow(ServiceUnavailableException);
  });
});
