import { Module } from '@nestjs/common';

import { StorageClientService } from './storage-client.service';

/**
 * Client ke bagdja-storage-service — pola sama seperti `ShippingModule`
 * (shipping-client.service.ts) untuk bagdja-shipping-service. Diekspor
 * supaya `UploadsModule` bisa reuse `StorageClientService`.
 */
@Module({
  providers: [StorageClientService],
  exports: [StorageClientService],
})
export class StorageModule {}
