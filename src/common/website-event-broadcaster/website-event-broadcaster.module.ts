import { Global, Module } from '@nestjs/common';

import { WebsiteEventBroadcasterService } from './website-event-broadcaster.service';

@Global()
@Module({
  providers: [WebsiteEventBroadcasterService],
  exports: [WebsiteEventBroadcasterService],
})
export class WebsiteEventBroadcasterModule {}
