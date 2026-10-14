import { Controller, MessageEvent, Param, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { interval, map, Observable, startWith, switchMap, takeWhile } from 'rxjs';

import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';
import { GatheringOccurrenceService } from './gathering-occurrence.service';

@ApiTags('Gathering Operations')
@Controller('api/gathering')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GatheringOperationsController {
  constructor(private readonly gatheringService: GatheringOccurrenceService) {}

  @Sse('plans/:id/operations/:operationId/events')
  @ApiOperation({ summary: 'Stream invoice/revocation operation progress for the gathering initiator' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  streamOperation(
    @CurrentUser() user: AuthUser,
    @Param('id') groupId: string,
    @Param('operationId') operationId: string,
    @Query('website_id') websiteId: string,
  ): Observable<MessageEvent> {
    return interval(1000).pipe(
      startWith(0),
      switchMap(() => this.gatheringService.getOperationForInitiator(groupId, operationId, websiteId, user.userId)),
      map((operation) => {
        const data = {
          id: operation.id,
          kind: operation.kind,
          status: operation.status,
          total_count: operation.total_count,
          processed_count: operation.processed_count,
          success_count: operation.success_count,
          failed_count: operation.failed_count,
          failed_items: operation.failed_items,
          error_message: operation.error_message,
        };
        return { id: operation.id, data } as MessageEvent;
      }),
      takeWhile((event) => {
        const data = event.data as { status: string };
        return ['QUEUED', 'RUNNING'].includes(data.status);
      }, true),
    );
  }
}
