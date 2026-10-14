import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';

import { GatheringOperation } from '../../entities/gathering-operation.entity';
import { GatheringOccurrenceService } from './gathering-occurrence.service';
import { ISSUE_GATHERING_INVOICES_JOB, GATHERING_OPERATIONS_QUEUE, REVOKE_GATHERING_INVITATION_JOB } from './gathering-operations.constants';

interface InvoiceJobData { operationId: string; }
interface RevokeInvitationJobData { operationId: string; invitationId: string; }

@Injectable()
@Processor(GATHERING_OPERATIONS_QUEUE, { concurrency: 3 })
export class GatheringOperationsProcessor extends WorkerHost {
  private readonly logger = new Logger(GatheringOperationsProcessor.name);

  constructor(
    @InjectRepository(GatheringOperation) private readonly operationRepo: Repository<GatheringOperation>,
    private readonly gatheringService: GatheringOccurrenceService,
  ) { super(); }

  @OnWorkerEvent('error')
  onWorkerError(error: Error) {
    this.logger.error(`Gathering queue worker error: ${error.message}`, error.stack);
  }

  @OnWorkerEvent('failed')
  onJobFailed(job: Job<InvoiceJobData | RevokeInvitationJobData> | undefined, error: Error) {
    this.logger.error(`Gathering job ${job?.name ?? 'unknown'} failed: ${error.message}`, error.stack);
  }

  async process(job: Job<InvoiceJobData | RevokeInvitationJobData>) {
    if (job.name === ISSUE_GATHERING_INVOICES_JOB) {
      const data = job.data as InvoiceJobData;
      const result = await this.gatheringService.processInvoiceIssuance(data.operationId);
      this.logger.log(`Invoice operation ${data.operationId}: ${result.status}, ${result.success_count}/${result.total_count}`);
      if (result.status === 'FAILED') {
        const attempts = Number(job.opts.attempts ?? 1);
        if (job.attemptsMade + 1 < attempts) {
          result.status = 'QUEUED';
          await this.operationRepo.save(result);
        }
        throw new Error(result.error_message || `Invoice email delivery failed for ${result.failed_count} attendee(s)`);
      }
      return result;
    }
    if (job.name === REVOKE_GATHERING_INVITATION_JOB) {
      const data = job.data as RevokeInvitationJobData;
      const result = await this.gatheringService.processInvitationRevocation(data.operationId, data.invitationId);
      this.logger.log(`Invitation revoke operation ${data.operationId}: ${result.status}`);
      return result;
    }
    throw new Error(`Unsupported gathering job: ${job.name}`);
  }
}
