import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateWebsiteChatThreadDto {
  @IsEnum(['product', 'support', 'order', 'transaction'] as const)
  channel_type: 'product' | 'support' | 'order' | 'transaction';

  @IsOptional()
  @IsString()
  @MinLength(1)
  channel_label?: string;

  @IsOptional()
  @IsUUID()
  product_id?: string;

  @IsOptional()
  @IsUUID()
  order_id?: string;

  @IsOptional()
  @IsUUID()
  order_item_id?: string;

  @IsOptional()
  @IsUUID()
  customer_user_id?: string;

  @IsOptional()
  @IsUUID()
  assigned_admin_user_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  initial_message?: string;
}
