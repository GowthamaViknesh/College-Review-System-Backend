import type { Types } from 'mongoose';
import type { ActionName, Outcome, TargetType } from '../constants/actions';

export interface IActionLog {
    // Who did it. The username is copied in so the entry still reads correctly after the account is deleted.
    // Both are null when nobody was logged in, e.g. a failed login.
    actor: { id: Types.ObjectId | null; username: string | null };
    action: ActionName;
    outcome: Outcome;
    // What it was done to. The id is null when nothing was created, e.g. a denied create.
    target: { type: TargetType | null; id: string | null };
    // Small, action-specific facts such as { role: "teacher" }. Never passwords or tokens.
    details: Record<string, unknown>;
    ip: string | null;
    method: string;
    path: string;
    statusCode: number;
    createdAt: Date;
}

// What is handed in to be saved: the actor id is still a plain string at that point
export type ActionLogEntry = Omit<IActionLog, 'createdAt' | 'actor'> & { actor: { id: string | null; username: string | null } };

export interface ActionLogFilter {
    actor?: string;
    action?: ActionName;
    outcome?: Outcome;
    targetType?: TargetType;
    targetId?: string;
    from?: Date;
    to?: Date;
}

export interface ListActionLogsQuery extends ActionLogFilter {
    page: number;
    limit: number;
}
