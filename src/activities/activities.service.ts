import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  assertBranchAccess,
  branchScope,
  isSuperAdmin,
  resolveBranchIdForCreate,
} from '../common/utils/scope.util';
import {
  formatDateOnly,
  isoWeekday,
  minuteRangesOverlap,
  timeToMinutes,
  toDateOnly,
} from '../common/utils/date.util';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ActivitySlotDto } from './dto/activity-slot.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { QueryActivityDto } from './dto/query-activity.dto';

const activityInclude = {
  branch: { select: { id: true, name: true, region: true } },
  trainer: {
    select: { id: true, username: true, fullName: true, phone: true },
  },
  createdBy: { select: { id: true, username: true, fullName: true } },
  slots: {
    select: { weekday: true, startTime: true, durationMinutes: true },
    orderBy: { weekday: 'asc' as const },
  },
  _count: { select: { attendances: true, enrollments: true } },
} satisfies Prisma.ActivityInclude;

/** A normalised weekly schedule: one entry per weekday, plus its date window. */
interface ScheduleShape {
  slots: { weekday: number; startTime: string; durationMinutes: number }[];
  startDate: Date;
  endDate: Date | null;
}

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateActivityDto, actor: AuthUser) {
    const branchId = resolveBranchIdForCreate(actor, dto.branchId);
    const schedule = this.buildSchedule(dto.slots, dto.startDate, dto.endDate);

    this.assertMaySchedule(actor, schedule.startDate);

    if (dto.trainerId) {
      await this.assertTrainerAvailable(dto.trainerId, branchId, schedule);
    }

    return this.prisma.activity.create({
      data: {
        title: dto.title,
        description: dto.description,
        capacity: dto.capacity,
        isActive: dto.isActive,
        trainerId: dto.trainerId,
        branchId,
        createdById: actor.id,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        slots: { create: schedule.slots },
      },
      include: activityInclude,
    });
  }

  async findAll(query: QueryActivityDto, actor: AuthUser) {
    const {
      page = 1,
      limit = 10,
      search,
      order = 'desc',
      branchId,
      trainerId,
      dayOfWeek,
      date,
      isActive,
    } = query;

    // Filtering by an exact date means "runs on that weekday AND that date is
    // inside the activity's active window".
    const onDate = date ? toDateOnly(date) : undefined;
    const weekday = onDate ? isoWeekday(onDate) : dayOfWeek;

    const where: Prisma.ActivityWhereInput = {
      // Removed activities drop out of the working lists but stay in the
      // reports, which read the rows straight from the table.
      deletedAt: null,
      ...branchScope(actor, branchId),
      // A trainer only ever sees the activities they run.
      ...(actor.role === Role.TRAINER
        ? { trainerId: actor.id }
        : trainerId && { trainerId }),
      ...(isActive !== undefined && { isActive }),
      ...(weekday && { slots: { some: { weekday } } }),
      ...(onDate && {
        startDate: { lte: onDate },
        OR: [{ endDate: null }, { endDate: { gte: onDate } }],
      }),
      ...(search && {
        AND: [
          {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              {
                description: { contains: search, mode: 'insensitive' as const },
              },
            ],
          },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        include: activityInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: order },
      }),
      this.prisma.activity.count({ where }),
    ]);

    return { data, meta: buildMeta(total, page, limit) };
  }

  async findOne(id: string, actor: AuthUser) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: activityInclude,
    });

    if (!activity || activity.deletedAt) {
      throw new NotFoundException(`Activity with id ${id} not found`);
    }

    assertBranchAccess(actor, activity.branchId);

    if (actor.role === Role.TRAINER && activity.trainerId !== actor.id) {
      throw new NotFoundException(`Activity with id ${id} not found`);
    }

    return activity;
  }

  async update(id: string, dto: UpdateActivityDto, actor: AuthUser) {
    const activity = await this.findOne(id, actor);

    const schedule = this.buildSchedule(
      dto.slots ?? activity.slots,
      dto.startDate ?? formatDateOnly(activity.startDate),
      dto.endDate ??
        (activity.endDate ? formatDateOnly(activity.endDate) : undefined),
    );

    // Only guard the rule when the start date actually moves — otherwise an
    // admin could never edit the title of an activity that already started.
    if (schedule.startDate.getTime() !== activity.startDate.getTime()) {
      this.assertMaySchedule(actor, schedule.startDate);
    }

    // `trainerId` may be cleared by sending null, kept by omitting the field.
    const trainerId =
      dto.trainerId === undefined ? activity.trainerId : dto.trainerId;

    if (trainerId) {
      await this.assertTrainerAvailable(
        trainerId,
        activity.branchId,
        schedule,
        id,
      );
    }

    return this.prisma.activity.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        trainerId,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        // The schedule is replaced wholesale: simpler than diffing, and the
        // unique [activityId, weekday] index makes partial updates fiddly.
        ...(dto.slots && {
          slots: { deleteMany: {}, create: schedule.slots },
        }),
      },
      include: activityInclude,
    });
  }

  /**
   * Retires the activity instead of erasing it: its attendance rows are the
   * visits report, and a hard delete would cascade them away and rewrite a
   * period that has already been reported on. Erasing for real is a manual
   * DELETE in the database.
   */
  async remove(id: string, actor: AuthUser) {
    await this.findOne(id, actor);

    await this.prisma.activity.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.id, isActive: false },
    });

    return {
      message:
        'Activity removed. Its attendance stays in the reports and can only be erased directly in the database.',
      id,
    };
  }

  /**
   * Concrete dates this activity runs on inside the given window, each with the
   * time that weekday is scheduled for.
   */
  async occurrences(id: string, actor: AuthUser, from?: string, to?: string) {
    const activity = await this.findOne(id, actor);

    const windowStart = from ? toDateOnly(from) : activity.startDate;
    const defaultEnd = new Date(windowStart);
    defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 30);

    const windowEnd = to ? toDateOnly(to) : defaultEnd;

    if (windowEnd < windowStart) {
      throw new BadRequestException('`to` must not be earlier than `from`');
    }

    const start =
      windowStart < activity.startDate ? activity.startDate : windowStart;
    const end =
      activity.endDate && activity.endDate < windowEnd
        ? activity.endDate
        : windowEnd;

    const byWeekday = new Map(
      activity.slots.map((slot) => [slot.weekday, slot]),
    );

    const occurrences: {
      date: string;
      weekday: number;
      startTime: string;
      durationMinutes: number;
    }[] = [];

    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const weekday = isoWeekday(cursor);
      const slot = byWeekday.get(weekday);
      if (!slot) continue;

      occurrences.push({
        date: formatDateOnly(cursor),
        weekday,
        startTime: slot.startTime,
        durationMinutes: slot.durationMinutes,
      });
    }

    return {
      activityId: activity.id,
      title: activity.title,
      slots: activity.slots,
      occurrences,
      /** Kept for clients that only need the dates. */
      dates: occurrences.map((entry) => entry.date),
    };
  }

  /**
   * Normalises the weekly schedule: one slot per weekday, sorted, with the
   * date window validated.
   */
  private buildSchedule(
    slots: ActivitySlotDto[] | { weekday: number; startTime: string; durationMinutes: number }[],
    startDateInput: string,
    endDateInput?: string,
  ): ScheduleShape {
    if (!slots || slots.length === 0) {
      throw new BadRequestException('An activity needs at least one weekday');
    }

    const seen = new Set<number>();
    for (const slot of slots) {
      if (seen.has(slot.weekday)) {
        throw new BadRequestException(
          `Weekday ${slot.weekday} is listed twice. An activity runs at most once per weekday.`,
        );
      }
      seen.add(slot.weekday);
      // Validates the format and surfaces a clear message before it hits the DB.
      timeToMinutes(slot.startTime);
    }

    const startDate = toDateOnly(startDateInput);
    const endDate = endDateInput ? toDateOnly(endDateInput) : null;

    if (endDate && endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }

    return {
      slots: [...slots]
        .sort((a, b) => a.weekday - b.weekday)
        .map((slot) => ({
          weekday: slot.weekday,
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes,
        })),
      startDate,
      endDate,
    };
  }

  /**
   * A branch admin may not schedule an activity in the past — only a super
   * admin can backfill.
   */
  private assertMaySchedule(actor: AuthUser, startDate: Date) {
    if (isSuperAdmin(actor)) return;

    const today = toDateOnly(new Date());

    if (startDate < today) {
      throw new BadRequestException(
        `startDate ${formatDateOnly(startDate)} is in the past. Only a super admin can schedule an activity for a past date.`,
      );
    }
  }

  /**
   * A trainer may run many activities, but never two that share a weekday and
   * overlap in time while both schedules are in effect. With per-weekday times
   * the check is per slot: Monday 13:00 and Friday 16:00 are compared
   * separately.
   */
  private async assertTrainerAvailable(
    trainerId: string,
    branchId: string,
    schedule: ScheduleShape,
    exceptActivityId?: string,
  ) {
    const trainer = await this.prisma.user.findUnique({
      where: { id: trainerId },
      select: {
        id: true,
        fullName: true,
        role: true,
        branchId: true,
        isActive: true,
      },
    });

    if (!trainer || trainer.role !== Role.TRAINER) {
      throw new NotFoundException(`Trainer with id ${trainerId} not found`);
    }

    if (!trainer.isActive) {
      throw new BadRequestException('This trainer account is deactivated');
    }

    if (trainer.branchId !== branchId) {
      throw new BadRequestException(
        'The trainer belongs to a different branch',
      );
    }

    const weekdays = schedule.slots.map((slot) => slot.weekday);

    const candidates = await this.prisma.activity.findMany({
      where: {
        trainerId,
        isActive: true,
        ...(exceptActivityId && { NOT: { id: exceptActivityId } }),
        // Weekday overlap, cheap enough to push into the query.
        slots: { some: { weekday: { in: weekdays } } },
        // Date-window overlap: the other activity must not end before this one
        // starts, and must not start after this one ends.
        AND: [
          {
            OR: [{ endDate: null }, { endDate: { gte: schedule.startDate } }],
          },
          schedule.endDate ? { startDate: { lte: schedule.endDate } } : {},
        ],
      },
      select: {
        id: true,
        title: true,
        slots: {
          select: { weekday: true, startTime: true, durationMinutes: true },
        },
      },
    });

    for (const slot of schedule.slots) {
      const start = timeToMinutes(slot.startTime);
      const end = start + slot.durationMinutes;

      for (const other of candidates) {
        const clash = other.slots.find((otherSlot) => {
          if (otherSlot.weekday !== slot.weekday) return false;
          const otherStart = timeToMinutes(otherSlot.startTime);
          return minuteRangesOverlap(
            start,
            end,
            otherStart,
            otherStart + otherSlot.durationMinutes,
          );
        });

        if (clash) {
          throw new ConflictException(
            `${trainer.fullName} already runs "${other.title}" at ${clash.startTime} on weekday ${clash.weekday}. A trainer cannot lead two activities at the same time.`,
          );
        }
      }
    }
  }
}
