import { ApiProperty } from '@nestjs/swagger';

/** Badge count sidebar "Penawaran" — jumlah draft order yang belum di-quote sama sekali. */
export class DraftOrderCountResponseDto {
  @ApiProperty()
  count: number;
}
