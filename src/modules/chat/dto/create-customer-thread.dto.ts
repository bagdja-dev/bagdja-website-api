import { OmitType } from '@nestjs/swagger';
import { CreateWebsiteChatThreadDto } from './create-thread.dto';

export class CreateCustomerWebsiteChatThreadDto extends OmitType(CreateWebsiteChatThreadDto, [
  'customer_user_id',
  'assigned_admin_user_id',
] as const) {}