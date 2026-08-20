import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/** Update qty draft PENDING (halaman /cart — stepper −/+). */
export class UpdateOrderQuantityDto {
  @ApiProperty({ description: 'Qty baru (minimal 1)', minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}
