import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class ReorderFaqsDto {
  @ApiProperty({ type: [String], description: 'Ordered array of FAQ UUIDs' })
  @IsArray()
  @IsUUID('4', { each: true })
  faq_ids: string[];
}
