import { ROLES_KEY } from '../../common/auth/roles.decorator';

import { AndroidAppsController } from './android-apps.controller';

describe('AndroidAppsController authorization metadata', () => {
  it('requires admin access for configuration changes, keystore uploads, and build operations', () => {
    const adminOperations = [
      'updateConfiguration',
      'uploadKeystore',
      'createBuild',
      'uploadImageAsset',
      'removeImageAsset',
      'listBuilds',
      'getBuild',
      'retireSigningFingerprint',
      'addPlayStoreFingerprints',
    ];

    for (const operation of adminOperations) {
      expect(
        Reflect.getMetadata(ROLES_KEY, AndroidAppsController.prototype[operation]),
      ).toEqual(['admin']);
    }
  });
});
