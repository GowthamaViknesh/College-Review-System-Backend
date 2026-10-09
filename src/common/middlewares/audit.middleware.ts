import type { RequestHandler, Response } from 'express';

import { recordAction } from '../../services/action-log.service';
import type { ActionName, Outcome, TargetType } from '../constants/actions';

// Facts about the action that only the controller knows, attached with setAudit()
interface AuditContext {
    // Set by register and login, where there is no logged-in user until the request has succeeded
    // id is the user's public id (userId)
    actor?: { id: string; username: string };
    // Set when the action created something, so its id is not in the URL
    targetId?: string;
    details?: Record<string, unknown>;
    // Set when the request succeeded but did nothing worth recording (logging out of a login that was already over)
    skip?: boolean;
}

export function setAudit(res: Response, context: AuditContext) {
    res.locals.audit = { ...res.locals.audit, ...context };
}

// 2xx: it happened. 403: the caller was not allowed. 401 only counts for login (wrong credentials).
// Everything else (validation errors, not found, conflicts) changed nothing and says nothing about
// access, so it is left out to keep the log readable.
function outcomeOf(action: ActionName, statusCode: number): Outcome | null {
    if (statusCode < 400) return 'success';
    if (statusCode === 403) return 'denied';
    if (statusCode === 401 && action === 'auth:login') return 'failed';
    return null;
}

// Put this first on a route that changes something. It waits until the response has been sent, then
// writes one action log entry. Being first matters: it lets it see requests that later middleware rejects.
export const audit =
    (action: ActionName, targetType: TargetType): RequestHandler =>
    (req, res, next) => {
        // Read now: once a request is refused, Express hands it to the error handler and clears the route's params
        const paramId = typeof req.params?.id === 'string' ? req.params.id : null;

        res.on('finish', () => {
            const outcome = outcomeOf(action, res.statusCode);
            if (!outcome) return;

            const context: AuditContext = res.locals.audit ?? {};
            if (context.skip) return;
            const actor = context.actor ?? (req.user ? { id: req.user.userId, username: req.user.username } : null);

            recordAction({
                actor: { id: actor?.id ?? null, username: actor?.username ?? null },
                action,
                outcome,
                target: { type: targetType, id: context.targetId ?? paramId },
                details: {
                    ...context.details,
                    // Why it was refused, as told to the caller
                    ...(outcome !== 'success' && res.locals.errorMessage && { reason: res.locals.errorMessage }),
                },
                ip: req.ip ?? null,
                method: req.method,
                // Without the query string, which is not part of what was done
                path: req.originalUrl.split('?')[0],
                statusCode: res.statusCode,
            });
        });
        next();
    };
