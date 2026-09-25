import { Global, Module } from '@nestjs/common';

import { ChatServiceClient } from './chat-service.client';

@Global()
@Module({
  providers: [ChatServiceClient],
  exports: [ChatServiceClient],
})
export class ChatServiceModule {}
