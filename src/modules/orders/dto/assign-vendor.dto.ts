import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignVendorDto {
  @ApiProperty({ description: 'Vendor aktif yang akan ditugaskan ke order' })
  @IsUUID()
  vendor_id: string;
}