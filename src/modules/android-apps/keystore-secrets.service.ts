import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { InternalServerErrorException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ENVELOPE_VERSION = 'v1';

@Injectable()
export class KeystoreSecretsService {
  constructor(private readonly config: ConfigService) {}

  encrypt(plaintext: string, websiteId: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getKey(), iv);
    cipher.setAAD(Buffer.from(`website:${websiteId}`, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      ENVELOPE_VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  decrypt(envelope: string, websiteId: string): string {
    const [version, iv, tag, ciphertext] = envelope.split(':');
    if (version !== ENVELOPE_VERSION || !iv || !tag || ciphertext === undefined) {
      throw new InternalServerErrorException('Encrypted signing secret has an unknown format');
    }

    try {
      const decipher = createDecipheriv('aes-256-gcm', this.getKey(), Buffer.from(iv, 'base64'));
      decipher.setAAD(Buffer.from(`website:${websiteId}`, 'utf8'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException('Signing secret could not be decrypted');
    }
  }

  private getKey(): Buffer {
    const encodedKey = this.config.get<string>('WEBSITE_ANDROID_SECRETS_ENCRYPTION_KEY');
    const key = Buffer.from(encodedKey ?? '', 'base64');
    if (key.length !== 32 || key.toString('base64') !== encodedKey) {
      throw new ServiceUnavailableException(
        'Website Android signing encryption key is not configured (32-byte base64 key required)',
      );
    }
    return key;
  }
}
