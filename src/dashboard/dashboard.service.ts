import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Role, TodoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { branchScope, isSuperAdmin } from '../common/utils/scope.util';
import {
  formatDateOnly,
  isoWeekday,
  timeToMinutes,
  toDateOnly,
} from '../common/utils/date.util';
import { QueryCalendarDto } from './dto/query-calendar.dto';

const calendarActivitySelect = {
  id: true,
  title: true,
  slots: {
    select: { weekday: true, startTime: true, durationMinutes: true },
  },
  startDate: true,
  endDate: true,
  capacity: true,
  branch: { select: { id: true, name: true, region: true } },
  trainer: { select: { id: true, fullName: true } },
} satisfies Prisma.ActivitySelect;

/** One dated occurrence of an activity, as the calendar renders it. */
export interface CalendarSession {
  activityId: string;
  title: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  capacity: number | null;
  branch: { id: string; name: string; region: string };
  trainer: { id: string; fullName: string } | null;
  attendedCount: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Headline numbers for the branch the caller controls. */
  async summary(actor: AuthUser, requestedBranchId?: string) {
    const scope = branchScope(actor, requestedBranchId);
    const today = toDateOnly(new Date());
    const weekday = isoWeekday(today);

    const branch = scope.branchId
      ? await this.prisma.branch.findUnique({ where: { id: scope.branchId } })
      : null;

    const [
      participantCount,
      activeParticipants,
      activityCount,
      trainerCount,
      adminCount,
      sessionsToday,
      attendanceToday,
      openTodos,
    ] = await this.prisma.$transaction([
      this.prisma.participant.count({ where: scope }),
      this.prisma.participant.count({ where: { ...scope, isActive: true } }),
      this.prisma.activity.count({ where: { ...scope, isActive: true } }),
      this.prisma.user.count({
        where: { ...scope, role: Role.TRAINER, isActive: true },
      }),
      this.prisma.user.count({
        where: { ...scope, role: Role.ADMIN, isActive: true },
      }),
      this.prisma.activity.count({
        where: {
          ...scope,
          isActive: true,
          slots: { some: { weekday } },
          startDate: { lte: today },
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: today,
          ...(scope.branchId && { activity: { branchId: scope.branchId } }),
        },
      }),
      this.prisma.todoItem.count({
        where: {
          status: { not: TodoStatus.DONE },
          ...(isSuperAdmin(actor) ? {} : { assigneeId: actor.id }),
        },
      }),
    ]);

    return {
      scope: isSuperAdmin(actor) && !scope.branchId ? 'ALL_BRANCHES' : 'BRANCH',
      branch,
      date: formatDateOnly(today),
      participants: { total: participantCount, active: activeParticipants },
      activities: { active: activityCount, scheduledToday: sessionsToday },
      staff: { admins: adminCount, trainers: trainerCount },
      attendanceToday,
      openTodos,
    };
  }

  /**
   * Expands every activity's weekly schedule into concrete dates so the
   * calendar can render a month at a time. Only dates that actually carry a
   * session are returned; empty days are simply absent.
   */
  async calendar(query: QueryCalendarDto, actor: AuthUser) {
    const { from, to } = this.resolveWindow(query.from, query.to);
    const scope = branchScope(actor, query.branchId);

    const activities = await this.prisma.activity.findMany({
      where: {
        ...scope,
        isActive: true,
        ...(query.trainerId && { trainerId: query.trainerId }),
        startDate: { lte: to },
        OR: [{ endDate: null }, { endDate: { gte: from } }],
      },
      select: calendarActivitySelect,
    });

    const attendanceCounts = await this.attendanceCounts(
      activities.map((activity) => activity.id),
      from,
      to,
    );

    const byDate = new Map<string, CalendarSession[]>();

    for (const activity of activities) {
      const start = activity.startDate > from ? activity.startDate : from;
      const end =
        activity.endDate && activity.endDate < to ? activity.endDate : to;

      // Each weekday carries its own time, so the slot decides when the
      // session starts on this particular date.
      const byWeekday = new Map(
        activity.slots.map((slot) => [slot.weekday, slot]),
      );

      for (
        const cursor = new Date(start);
        cursor <= end;
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        const slot = byWeekday.get(isoWeekday(cursor));
        if (!slot) {
          continue;
        }

        const key = formatDateOnly(cursor);
        const bucket = byDate.get(key) ?? [];
        bucket.push(
          this.toSession(
            activity,
            slot,
            attendanceCounts.get(`${activity.id}|${key}`) ?? 0,
          ),
        );
        byDate.set(key, bucket);
      }
    }

    const days = [...byDate.entries()]
      .map(([date, sessions]) => ({
        date,
        weekday: isoWeekday(toDateOnly(date)),
        sessionCount: sessions.length,
        sessions: sessions.sort(
          (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
        ),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      from: formatDateOnly(from),
      to: formatDateOnly(to),
      totalSessions: days.reduce((sum, day) => sum + day.sessionCount, 0),
      days,
    };
  }

  /** Everything that runs on one calendar day, ordered by start time. */
  async day(dateInput: string, actor: AuthUser, branchId?: string) {
    const date = toDateOnly(dateInput);
    const scope = branchScope(actor, branchId);
    const weekday = isoWeekday(date);

    const activities = await this.prisma.activity.findMany({
      where: {
        ...scope,
        isActive: true,
        slots: { some: { weekday } },
        startDate: { lte: date },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
      },
      select: calendarActivitySelect,
    });

    const counts = await this.attendanceCounts(
      activities.map((activity) => activity.id),
      date,
      date,
    );

    const key = formatDateOnly(date);
    const sessions = activities
      .flatMap((activity) => {
        const slot = activity.slots.find((entry) => entry.weekday === weekday);
        return slot
          ? [
              this.toSession(
                activity,
                slot,
                counts.get(`${activity.id}|${key}`) ?? 0,
              ),
            ]
          : [];
      })
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    return { date: key, weekday, sessionCount: sessions.length, sessions };
  }

  /** Attendance totals keyed by `activityId|YYYY-MM-DD`. */
  private async attendanceCounts(
    activityIds: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, number>> {
    if (activityIds.length === 0) {
      return new Map();
    }

    const grouped = await this.prisma.attendance.groupBy({
      by: ['activityId', 'date'],
      where: {
        activityId: { in: activityIds },
        date: { gte: from, lte: to },
      },
      _count: { _all: true },
    });

    return new Map(
      grouped.map((row) => [
        `${row.activityId}|${formatDateOnly(row.date)}`,
        row._count._all,
      ]),
    );
  }

  private toSession(
    activity: Prisma.ActivityGetPayload<{
      select: typeof calendarActivitySelect;
    }>,
    slot: { weekday: number; startTime: string; durationMinutes: number },
    attendedCount: number,
  ): CalendarSession {
    const startMinutes = timeToMinutes(slot.startTime);
    const endMinutes = startMinutes + slot.durationMinutes;

    return {
      activityId: activity.id,
      title: activity.title,
      startTime: slot.startTime,
      endTime: this.minutesToTime(endMinutes),
      durationMinutes: slot.durationMinutes,
      capacity: activity.capacity,
      branch: activity.branch,
      trainer: activity.trainer,
      attendedCount,
    };
  }

  private minutesToTime(minutes: number): string {
    // A session may run past midnight; wrap so the label stays valid.
    const wrapped = minutes % (24 * 60);
    const hours = Math.floor(wrapped / 60);
    return `${String(hours).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
  }

  /** Defaults to the current calendar month, capped at one year per request. */
  private resolveWindow(fromInput?: string, toInput?: string) {
    const now = new Date();

    const from = fromInput
      ? toDateOnly(fromInput)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const to = toInput
      ? toDateOnly(toInput)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

    if (to < from) {
      throw new BadRequestException('`to` must not be earlier than `from`');
    }

    const spanDays = (to.getTime() - from.getTime()) / 86_400_000;
    if (spanDays > 366) {
      throw new BadRequestException(
        'The calendar window cannot be longer than one year',
      );
    }

    return { from, to };
  }
}
