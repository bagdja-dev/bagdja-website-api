import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class ReorderSectionsDto {
  @ApiProperty({ type: [String], description: 'Ordered array of section UUIDs' })
  @IsArray()
  @IsUUID('4', { each: true })
  section_ids: string[];
}
