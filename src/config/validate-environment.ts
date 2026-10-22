function requiredString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be configured in production`);
  }
  return value.trim();
}

function validateBuilderUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('TWA_BUILDER_URL must be a valid HTTPS base URL in production');
  }

  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error('TWA_BUILDER_URL must be a valid HTTPS base URL in production');
  }
}

function validateEncryptionKey(value: string): void {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new Error(
      'WEBSITE_ANDROID_SECRETS_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key in production',
    );
  }
}

function validatePlatformHost(value: string): void {
  let url: URL;
  try {
    url = new URL(`https://${value}`);
  } catch {
    throw new Error('PLATFORM_HOST must be a hostname without protocol or port in production');
  }

  if (
    url.hostname !== value.toLowerCase() ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('PLATFORM_HOST must be a hostname without protocol or port in production');
  }
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (config.NODE_ENV !== 'production') return config;

  requiredString(config, 'CLIENT_APP_ID');
  requiredString(config, 'CLIENT_APP_SECRET');
  validateBuilderUrl(requiredString(config, 'TWA_BUILDER_URL'));
  validateEncryptionKey(requiredString(config, 'WEBSITE_ANDROID_SECRETS_ENCRYPTION_KEY'));
  validatePlatformHost(requiredString(config, 'PLATFORM_HOST'));
  const androidAppsEnabled = config.WEBSITE_ANDROID_APPS_ENABLED;
  if (
    androidAppsEnabled !== undefined &&
    typeof androidAppsEnabled === 'string' &&
    !['true', 'false'].includes(androidAppsEnabled.trim().toLowerCase())
  ) {
    throw new Error('WEBSITE_ANDROID_APPS_ENABLED must be true or false in production');
  }

  return config;
}
