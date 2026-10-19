export const GATHERING_OPERATIONS_QUEUE = 'website-gathering-operations';
export const ISSUE_GATHERING_INVOICES_JOB = 'issue-gathering-invoices';
export const REVOKE_GATHERING_INVITATION_JOB = 'revoke-gathering-invitation';
export const DISPATCH_GATHERING_INVITATIONS_JOB = 'dispatch-gathering-invitations';

// Operasi yang tidak diambil worker (QUEUED) atau berhenti tanpa progres (RUNNING)
// melewati batas ini dianggap macet dan ditandai FAILED, supaya UI berhenti
// menunggu dan inisiator bisa submit ulang.
export const QUEUED_OPERATION_STALE_MS = 2 * 60 * 1000;
export const RUNNING_OPERATION_STALE_MS = 5 * 60 * 1000;

// Batas tunggu `queue.add()` sebelum operasi dianggap gagal enqueue (Redis tidak terjangkau).
export const OPERATION_ENQUEUE_TIMEOUT_MS = 5000;
