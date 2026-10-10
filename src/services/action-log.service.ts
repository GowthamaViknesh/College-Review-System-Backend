import logger from '../common/config/logger';
import { paginationMeta } from '../common/utils/utils';
import * as actionLogRepository from '../repositories/action-log.repository';
import { ActionLogEntry, ListActionLogsQuery } from '../common/interfaces/action-log.interface';

const pending = new Set<Promise<unknown>>();

export function recordAction(entry: ActionLogEntry) {
    const write = actionLogRepository
        .create(entry)
        .catch((err) => logger.error({ err, entry }, 'Failed to write action log entry'))
        .finally(() => pending.delete(write));
    pending.add(write);
}

export async function flushActionLogs() {
    await Promise.all(pending);
}

export async function listActionLogs({ page, limit, ...filter }: ListActionLogsQuery) {
    const [logs, total] = await Promise.all([actionLogRepository.findPage(filter, page, limit), actionLogRepository.count(filter)]);

    return { logs, meta: paginationMeta(page, limit, total) };
}
