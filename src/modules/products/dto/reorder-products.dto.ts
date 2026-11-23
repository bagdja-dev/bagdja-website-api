import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReorderProductsDto {
  @ApiProperty({ type: [String], description: 'Ordered array of top-level product UUIDs' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  product_ids: string[];
}
