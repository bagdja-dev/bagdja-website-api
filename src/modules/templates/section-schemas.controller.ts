import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SectionSchemasResponseDto } from './dto/section-schema.dto';
import {
  SECTION_CATALOG_VERSION,
  SECTION_SCHEMAS,
  type SectionSchemasResponse,
} from './section-schema.registry';

@ApiTags('Templates')
@Controller('api/section-schemas')
export class SectionSchemasController {
  @Get()
  @ApiOperation({ summary: 'Get the host section schema catalog (public)' })
  @ApiOkResponse({
    type: SectionSchemasResponseDto,
    description:
      'Katalog section host berversi: field (tipe, label, default, opsi, itemFields), kategori, modul yang dibutuhkan, ' +
      'sumber data otomatis, aturan hero (singleton, pinned top). Dipakai form Studio dan validasi renderer.',
  })
  list(): SectionSchemasResponse {
    return {
      catalogVersion: SECTION_CATALOG_VERSION,
      sections: SECTION_SCHEMAS,
    };
  }
}
