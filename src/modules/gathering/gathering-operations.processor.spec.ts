jest.mock('@nestjs/bullmq', () => ({
  OnWorkerEvent: () => () => undefined,
  Processor: () => () => undefined,
  WorkerHost: class WorkerHost {},
}));

import { GatheringOperationsProcessor } from './gathering-operations.processor';
import { ISSUE_GATHERING_INVOICES_JOB } from './gathering-operations.constants';

describe('GatheringOperationsProcessor', () => {
  it('keeps invoice operation queued while BullMQ retries failed email delivery', async () => {
    const operation = {
      id: 'operation-1',
      status: 'FAILED',
      failed_count: 1,
      success_count: 0,
      total_count: 1,
      error_message: 'Messaging service rejected one or more invoice emails.',
    };
    const operationRepo = { save: jest.fn(async (value) => value) };
    const gatheringService = { processInvoiceIssuance: jest.fn().mockResolvedValue(operation) };
    const processor = new GatheringOperationsProcessor(operationRepo as any, gatheringService as any);
    const job = {
      name: ISSUE_GATHERING_INVOICES_JOB,
      data: { operationId: 'operation-1' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as any;

    await expect(processor.process(job)).rejects.toThrow('Messaging service rejected one or more invoice emails.');

    expect(operation.status).toBe('QUEUED');
    expect(operationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'operation-1', status: 'QUEUED' }));
  });

  it('leaves the invoice operation failed after the final delivery attempt', async () => {
    const operation = {
      id: 'operation-1',
      status: 'FAILED',
      failed_count: 1,
      success_count: 0,
      total_count: 1,
      error_message: 'Messaging service rejected one or more invoice emails.',
    };
    const operationRepo = { save: jest.fn(async (value) => value) };
    const gatheringService = { processInvoiceIssuance: jest.fn().mockResolvedValue(operation) };
    const processor = new GatheringOperationsProcessor(operationRepo as any, gatheringService as any);
    const job = {
      name: ISSUE_GATHERING_INVOICES_JOB,
      data: { operationId: 'operation-1' },
      attemptsMade: 2,
      opts: { attempts: 3 },
    } as any;

    await expect(processor.process(job)).rejects.toThrow('Messaging service rejected one or more invoice emails.');

    expect(operation.status).toBe('FAILED');
    expect(operationRepo.save).not.toHaveBeenCalled();
  });
});
