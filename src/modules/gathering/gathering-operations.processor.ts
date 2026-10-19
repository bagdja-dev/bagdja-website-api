import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';

import { GatheringOperation } from '../../entities/gathering-operation.entity';
import { GatheringOccurrenceService } from './gathering-occurrence.service';
import { DISPATCH_GATHERING_INVITATIONS_JOB, ISSUE_GATHERING_INVOICES_JOB, GATHERING_OPERATIONS_QUEUE, REVOKE_GATHERING_INVITATION_JOB } from './gathering-operations.constants';

interface InvoiceJobData { operationId: string; }
interface RevokeInvitationJobData { operationId: string; invitationId: string; }
interface InvitationDispatchJobData { operationId: string; }

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
  async onJobFailed(job: Job<InvoiceJobData | RevokeInvitationJobData | InvitationDispatchJobData> | undefined, error: Error) {
    this.logger.error(`Gathering job ${job?.name ?? 'unknown'} failed: ${error.message}`, error.stack);
    if (job?.name !== DISPATCH_GATHERING_INVITATIONS_JOB) return;

    const attempts = Number(job.opts.attempts ?? 1);
    if (job.attemptsMade < attempts) return;
    const { operationId } = job.data as InvitationDispatchJobData;
    const operation = await this.operationRepo.findOne({ where: { id: operationId, kind: 'INVITATION_DISPATCH' } });
    if (!operation || ['COMPLETED', 'FAILED'].includes(operation.status)) return;
    operation.status = 'FAILED';
    operation.failed_count = Math.max(operation.total_count - operation.processed_count, 1);
    operation.error_message = 'Invitation email dispatch could not be completed';
    await this.operationRepo.save(operation);
  }

  async process(job: Job<InvoiceJobData | RevokeInvitationJobData | InvitationDispatchJobData>) {
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
    if (job.name === DISPATCH_GATHERING_INVITATIONS_JOB) {
      const data = job.data as InvitationDispatchJobData;
      const result = await this.gatheringService.processInvitationDispatch(data.operationId);
      this.logger.log(`Invitation dispatch operation ${data.operationId}: ${result.status}, ${result.success_count}/${result.total_count}`);
      return result;
    }
    throw new Error(`Unsupported gathering job: ${job.name}`);
  }
}
