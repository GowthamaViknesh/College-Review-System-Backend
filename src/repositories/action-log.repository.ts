import { ActionLog } from '../models/action-log.model';
import { ActionLogEntry, ActionLogFilter } from '../common/interfaces/action-log.interface';

// Deliberately no update or delete here: the action log is append-only

function buildFilter({ actor, action, outcome, targetType, targetId, from, to }: ActionLogFilter) {
    const filter: Record<string, unknown> = {};
    if (actor) filter['actor.id'] = actor;
    if (action) filter.action = action;
    if (outcome) filter.outcome = outcome;
    if (targetType) filter['target.type'] = targetType;
    if (targetId) filter['target.id'] = targetId;
    if (from || to) filter.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
    return filter;
}

export function create(entry: ActionLogEntry) {
    return ActionLog.create(entry);
}

export function findPage(filter: ActionLogFilter, pageNumber: number, pageSize: number) {
    const skips = pageSize * (pageNumber - 1);

    return ActionLog.find(buildFilter(filter)).sort({ createdAt: -1, _id: -1 }).skip(skips).limit(pageSize);
}

export function count(filter: ActionLogFilter) {
    return ActionLog.countDocuments(buildFilter(filter));
}
