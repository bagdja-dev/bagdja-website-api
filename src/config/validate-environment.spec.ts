import { validateEnvironment } from './validate-environment';

describe('validateEnvironment', () => {
  const productionConfig = () => ({
    NODE_ENV: 'production',
    CLIENT_APP_ID: 'website-builder',
    CLIENT_APP_SECRET: 'service-secret',
    TWA_BUILDER_URL: 'https://builder.example.com',
    WEBSITE_ANDROID_SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
    PLATFORM_HOST: 'sites.example.com',
  });

  it('accepts complete production configuration', () => {
    const config = productionConfig();
    expect(validateEnvironment(config)).toBe(config);
  });

  it('does not impose production requirements in development', () => {
    const config = { NODE_ENV: 'development' };
    expect(validateEnvironment(config)).toBe(config);
  });

  it('requires server-to-server credentials', () => {
    const config = productionConfig();
    delete (config as Partial<typeof config>).CLIENT_APP_SECRET;

    expect(() => validateEnvironment(config)).toThrow(
      'CLIENT_APP_SECRET must be configured in production',
    );
  });

  it('requires an HTTPS Builder URL without a path', () => {
    const config = productionConfig();
    config.TWA_BUILDER_URL = 'http://builder.example.com';

    expect(() => validateEnvironment(config)).toThrow(
      'TWA_BUILDER_URL must be a valid HTTPS base URL in production',
    );
  });

  it('requires a canonical base64 32-byte encryption key', () => {
    const config = productionConfig();
    config.WEBSITE_ANDROID_SECRETS_ENCRYPTION_KEY = Buffer.alloc(31, 4).toString('base64');

    expect(() => validateEnvironment(config)).toThrow(
      'WEBSITE_ANDROID_SECRETS_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key in production',
    );
  });

  it('requires a platform hostname without a port or URL scheme', () => {
    const config = productionConfig();
    config.PLATFORM_HOST = 'https://sites.example.com';

    expect(() => validateEnvironment(config)).toThrow(
      'PLATFORM_HOST must be a hostname without protocol or port in production',
    );
  });

  it('rejects an invalid Android feature flag value', () => {
    const config = {
      ...productionConfig(),
      WEBSITE_ANDROID_APPS_ENABLED: 'yes',
    };

    expect(() => validateEnvironment(config)).toThrow(
      'WEBSITE_ANDROID_APPS_ENABLED must be true or false in production',
    );
  });
});
