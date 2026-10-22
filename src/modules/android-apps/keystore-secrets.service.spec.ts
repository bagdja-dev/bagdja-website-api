import { InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { KeystoreSecretsService } from './keystore-secrets.service';

describe('KeystoreSecretsService', () => {
  const encryptionKey = Buffer.alloc(32, 7).toString('base64');
  const createService = (key = encryptionKey) => new KeystoreSecretsService({
    get: jest.fn().mockReturnValue(key),
  } as unknown as ConfigService);

  it('encrypts and decrypts a password bound to its website', () => {
    const service = createService();
    const encrypted = service.encrypt('private-password', 'website-1');

    expect(encrypted).not.toContain('private-password');
    expect(service.decrypt(encrypted, 'website-1')).toBe('private-password');
    expect(() => service.decrypt(encrypted, 'website-2')).toThrow(InternalServerErrorException);
  });

  it('rejects ciphertext tampering', () => {
    const service = createService();
    const encrypted = service.encrypt('private-password', 'website-1');
    const parts = encrypted.split(':');
    parts[2] = Buffer.alloc(16).toString('base64');

    expect(() => service.decrypt(parts.join(':'), 'website-1')).toThrow(
      InternalServerErrorException,
    );
  });

  it('fails closed when the encryption key is not a 32-byte base64 value', () => {
    const service = createService('not-a-valid-key');

    expect(() => service.encrypt('private-password', 'website-1')).toThrow(
      ServiceUnavailableException,
    );
  });
});
