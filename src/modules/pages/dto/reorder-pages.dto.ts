import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class ReorderPagesDto {
  @ApiProperty({ type: [String], description: 'Ordered array of page UUIDs' })
  @IsArray()
  @IsUUID('4', { each: true })
  page_ids: string[];
}
