import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { QueryAuditDto } from './dto/query-audit.dto';

/** What the interceptor hands over once a mutating request has finished. */
export interface AuditEvent {
  method: string;
  path: string;
  statusCode: number;
  actor?: AuthUser;
  /** Payload the handler returned, used to name the entity that was touched. */
  body?: unknown;
  /** Read before the handler ran, so a delete can still name what it removed. */
  snapshot?: EntitySnapshot | null;
}

export interface EntitySnapshot {
  label: string;
  branchId: string | null;
}

/**
 * The trail of who changed what.
 *
 * Every write goes through here, so a super admin can tell which admin, in
 * which branch, created or removed a record — without that, a mistake in one
 * branch is impossible to attribute and easy to pin on someone else.
 *
 * Only the shape of the request is kept: method, path, the entity touched and
 * a short sentence. Request bodies are never stored, so passwords cannot leak
 * into the log.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes one entry. Never throws: an audit failure must not turn a request
   * that already succeeded into an error for the admin using the panel.
   */
  async record(event: AuditEvent) {
    try {
      // A login carries no authenticated user yet — the response says who just
      // got in, and a login is exactly the entry worth attributing.
      const actor = event.actor ?? readLoggedInUser(event.body);
      const resource = resourceOf(event.path);
      const action = `${resource.entityType ?? 'request'}.${verbOf(event.method, event.path)}`;
      const entityId = event.snapshot
        ? resource.entityId
        : (readId(event.body) ?? resource.entityId);

      // A super admin belongs to no branch, so "where did this happen" has to
      // come from the record they touched — otherwise the entry that matters
      // most is the one that says the least. The same lookup names the record
      // when the response did not (marking attendance answers with a sheet,
      // not with the activity's title).
      const needsLookup = !actor?.branchId || !readLabel(event.body);
      const touched =
        event.snapshot ??
        (needsLookup ? await this.describe(resource.entityType, entityId) : null);

      await this.prisma.auditLog.create({
        data: {
          action,
          method: event.method,
          path: event.path,
          entityType: resource.entityType,
          entityId: entityId?.slice(0, 64),
          summary: this.summarise(event, action, actor, touched).slice(0, 500),
          statusCode: event.statusCode,
          actorId: actor?.id,
          actorUsername: actor?.username,
          actorRole: actor?.role,
          branchId: actor?.branchId ?? touched?.branchId ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Could not write the audit entry for ${event.method} ${event.path}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Names the entity a request is about to change, so a delete leaves behind
   * more than an id. Runs before the handler, and stays silent on failure —
   * the request matters more than the label.
   */
  async snapshot(method: string, path: string): Promise<EntitySnapshot | null> {
    if (method !== 'DELETE') return null;

    const { entityType, entityId } = resourceOf(path);
    return this.describe(entityType, entityId);
  }

  /** Looks up the name and branch of one record, or nothing if it cannot. */
  private async describe(
    entityType: string | null,
    entityId: string | null,
  ): Promise<EntitySnapshot | null> {
    if (!entityType || !entityId) return null;

    try {
      switch (entityType) {
        case 'participant': {
          const row = await this.prisma.participant.findUnique({
            where: { id: entityId },
            select: { firstName: true, lastName: true, branchId: true },
          });
          return row
            ? {
                label: `${row.lastName} ${row.firstName}`,
                branchId: row.branchId,
              }
            : null;
        }
        case 'activity': {
          const row = await this.prisma.activity.findUnique({
            where: { id: entityId },
            select: { title: true, branchId: true },
          });
          return row ? { label: row.title, branchId: row.branchId } : null;
        }
        case 'user': {
          const row = await this.prisma.user.findUnique({
            where: { id: entityId },
            select: { fullName: true, username: true, branchId: true },
          });
          return row
            ? {
                label: `${row.fullName} (${row.username})`,
                branchId: row.branchId,
              }
            : null;
        }
        case 'branch': {
          const row = await this.prisma.branch.findUnique({
            where: { id: entityId },
            select: { id: true, name: true },
          });
          return row ? { label: row.name, branchId: row.id } : null;
        }
        case 'announcement': {
          const row = await this.prisma.announcement.findUnique({
            where: { id: entityId },
            select: { title: true, branchId: true },
          });
          return row ? { label: row.title, branchId: row.branchId } : null;
        }
        // `/attendance/activities/<id>` — the id in the path is the activity's,
        // which is also what says where the session was held.
        case 'attendance': {
          const row = await this.prisma.activity.findUnique({
            where: { id: entityId },
            select: { title: true, branchId: true },
          });
          return row ? { label: row.title, branchId: row.branchId } : null;
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  /** The log itself — super admin only, newest first. */
  async findAll(query: QueryAuditDto, _actor: AuthUser) {
    const {
      page = 1,
      limit = 20,
      search,
      order = 'desc',
      actorId,
      branchId,
      action,
      entityType,
      from,
      to,
    } = query;

    const where: Prisma.AuditLogWhereInput = {
      ...(actorId && { actorId }),
      ...(branchId && { branchId }),
      ...(entityType && { entityType }),
      ...(action && { action: { startsWith: action } }),
      ...((from ?? to) && {
        createdAt: {
          ...(from && { gte: new Date(`${from}T00:00:00.000Z`) }),
          ...(to && { lte: new Date(`${to}T23:59:59.999Z`) }),
        },
      }),
      ...(search && {
        OR: [
          { summary: { contains: search, mode: 'insensitive' as const } },
          { actorUsername: { contains: search, mode: 'insensitive' as const } },
          { path: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, username: true, fullName: true } },
          branch: { select: { id: true, name: true, region: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: order },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  /** The distinct actors and actions in the log, for the filter dropdowns. */
  async filters() {
    const [actors, actions] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { actorId: { not: null } },
        distinct: ['actorId'],
        select: { actorId: true, actorUsername: true, actorRole: true },
        orderBy: { actorUsername: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
    ]);

    return {
      actors: actors.map((row) => ({
        id: row.actorId,
        username: row.actorUsername,
        role: row.actorRole,
      })),
      actions: actions.map((row) => row.action),
    };
  }

  /** One readable sentence: who did what, to which record. */
  private summarise(
    event: AuditEvent,
    action: string,
    actor: AuthUser | undefined,
    touched: EntitySnapshot | null,
  ): string {
    const who = actor
      ? `${actor.username}${actor.role === Role.SUPER_ADMIN ? ' (super admin)' : ''}`
      : 'an unauthenticated caller';

    const label = touched?.label ?? readLabel(event.body);
    const what = label ? `"${label}"` : resourceOf(event.path).entityId;
    const outcome = event.statusCode >= 400 ? ' — refused' : '';

    return `${who} · ${action}${what ? ` · ${what}` : ''}${outcome}`;
  }
}

/** POST → create, PATCH/PUT → update, DELETE → delete, with a few named cases. */
function verbOf(method: string, path: string): string {
  if (path.includes('/attendance/')) return 'mark';
  if (path.endsWith('/login')) return 'login';

  switch (method) {
    case 'POST':
      return 'create';
    case 'PATCH':
    case 'PUT':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return method.toLowerCase();
  }
}

const ENTITY_BY_SEGMENT: Record<string, string> = {
  participants: 'participant',
  activities: 'activity',
  users: 'user',
  branches: 'branch',
  announcements: 'announcement',
  attendance: 'attendance',
  auth: 'auth',
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pulls the entity type and id out of a path like `/api/activities/<uuid>`. */
function resourceOf(path: string): {
  entityType: string | null;
  entityId: string | null;
} {
  const segments = path.split('?')[0].split('/').filter(Boolean);
  const start = segments[0] === 'api' ? 1 : 0;

  return {
    entityType: ENTITY_BY_SEGMENT[segments[start]] ?? segments[start] ?? null,
    entityId: segments.slice(start).find((segment) => UUID.test(segment)) ?? null,
  };
}

/** The `user` a successful login hands back, shaped like the request actor. */
function readLoggedInUser(body: unknown): AuthUser | undefined {
  if (!body || typeof body !== 'object') return undefined;

  const user = (body as { user?: unknown }).user;
  if (!user || typeof user !== 'object') return undefined;

  const { id, username, role, branch } = user as {
    id?: unknown;
    username?: unknown;
    role?: unknown;
    branch?: { id?: unknown } | null;
  };

  if (typeof id !== 'string' || typeof username !== 'string') return undefined;

  return {
    id,
    username,
    role: role as Role,
    branchId: typeof branch?.id === 'string' ? branch.id : null,
  };
}

function readId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const id = (body as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

/** The most name-like field a handler's response carries. */
function readLabel(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;

  const record = body as Record<string, unknown>;
  for (const key of ['title', 'fullName', 'name', 'username']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }

  return null;
}
