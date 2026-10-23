import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PublicGatheringTicketResponseDto } from './dto/gathering-attendance.dto';
import { GatheringAttendanceService } from './gathering-attendance.service';

@ApiTags('Public Gathering Tickets')
@Controller('api/public/gathering-tickets')
export class PublicGatheringTicketController {
  constructor(private readonly attendanceService: GatheringAttendanceService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Read the attendee-safe ticket for the renderer ticket page and QR image' })
  @ApiOkResponse({ type: PublicGatheringTicketResponseDto, description: 'Ticket summary without attendee contact details. ticket_url is the value encoded in the QR.' })
  @ApiNotFoundResponse({ description: 'Unknown or malformed ticket token.' })
  getTicket(@Param('token') token: string) {
    return this.attendanceService.getPublicTicket(token);
  }
}
