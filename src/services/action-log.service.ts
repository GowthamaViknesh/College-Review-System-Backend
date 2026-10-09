import logger from '../common/config/logger';
import { paginationMeta } from '../common/utils/utils';
import * as actionLogRepository from '../repositories/action-log.repository';
import { ActionLogEntry, ListActionLogsQuery } from '../common/interfaces/action-log.interface';

// Writes that have been started but not yet saved
const pending = new Set<Promise<unknown>>();

// Saves an entry without making the caller wait. A logging problem must never turn a request
// that succeeded into an error, so a failed write is reported in the application log and dropped.
export function recordAction(entry: ActionLogEntry) {
    const write = actionLogRepository
        .create(entry)
        .catch((err) => logger.error({ err, entry }, 'Failed to write action log entry'))
        .finally(() => pending.delete(write));
    pending.add(write);
}

// Waits for every entry still being written. Used on shutdown so none are lost, and in tests.
export async function flushActionLogs() {
    await Promise.all(pending);
}

export async function listActionLogs({ page, limit, ...filter }: ListActionLogsQuery) {
    const [logs, total] = await Promise.all([actionLogRepository.findPage(filter, page, limit), actionLogRepository.count(filter)]);

    return { logs, meta: paginationMeta(page, limit, total) };
}
