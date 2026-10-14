import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { GatheringOccurrenceService } from './gathering-occurrence.service';

@ApiTags('Public Gathering Invoices')
@Controller('api/public/gathering-invoices')
export class GatheringPublicInvoiceController {
  constructor(private readonly occurrenceService: GatheringOccurrenceService) {}

  @Get(':registrationId')
  @ApiOperation({ summary: 'Read the public-safe summary of an issued gathering invoice' })
  @ApiOkResponse({ description: 'Public invoice details without attendee contact information.' })
  @ApiNotFoundResponse({ description: 'Invoice is not public, not issued, or does not exist.' })
  getInvoice(@Param('registrationId') registrationId: string) {
    if (!isUuid(registrationId)) throw new NotFoundException('Invoice not found');
    return this.occurrenceService.getPublicInvoice(registrationId);
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
