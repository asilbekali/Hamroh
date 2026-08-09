import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { assertBranchAccess, branchScope } from '../common/utils/scope.util';
import {
  formatDateOnly,
  isoWeekday,
  toDateOnly,
} from '../common/utils/date.util';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';

const attendanceInclude = {
  participant: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      phone: true,
    },
  },
  activity: {
    select: {
      id: true,
      title: true,
      slots: { select: { weekday: true, startTime: true } },
    },
  },
  recordedBy: { select: { id: true, username: true, fullName: true } },
} satisfies Prisma.AttendanceInclude;

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Attaches the people who turned up to one dated occurrence of an activity.
   * Idempotent: re-sending a participant updates their status instead of failing.
   */
  async mark(activityId: string, dto: MarkAttendanceDto, actor: AuthUser) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: {
        id: true,
        title: true,
        branchId: true,
        slots: { select: { weekday: true, startTime: true } },
        startDate: true,
        endDate: true,
        capacity: true,
      },
    });

    if (!activity) {
      throw new NotFoundException(`Activity with id ${activityId} not found`);
    }

    assertBranchAccess(actor, activity.branchId);

    const date = toDateOnly(dto.date);

    // Attendance records who actually turned up, so it can only be written for
    // a session that has already run. Without this a future date would be
    // accepted and then never appear in any report, whose windows end today.
    if (date > toDateOnly(new Date())) {
      throw new BadRequestException(
        `${formatDateOnly(date)} is in the future. Attendance can only be recorded for a session that has already taken place.`,
      );
    }

    this.assertDateIsScheduled(activity, date);

    const participantIds = [
      ...new Set(dto.entries.map((entry) => entry.participantId)),
    ];

    const participants = await this.prisma.participant.findMany({
      where: { id: { in: participantIds } },
      select: {
        id: true,
        branchId: true,
        isActive: true,
        firstName: true,
        lastName: true,
      },
    });

    if (participants.length !== participantIds.length) {
      throw new NotFoundException('One or more participants were not found');
    }

    const foreign = participants.find(
      (participant) => participant.branchId !== activity.branchId,
    );

    if (foreign) {
      throw new BadRequestException(
        `${foreign.lastName} ${foreign.firstName} belongs to another branch and cannot join this activity`,
      );
    }

    if (activity.capacity) {
      const alreadyMarked = await this.prisma.attendance.count({
        where: {
          activityId,
          date,
          participantId: { notIn: participantIds },
        },
      });

      if (alreadyMarked + participantIds.length > activity.capacity) {
        throw new BadRequestException(
          `This session holds ${activity.capacity} people; you are trying to record ${
            alreadyMarked + participantIds.length
          }.`,
        );
      }
    }

    await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.attendance.upsert({
          where: {
            activityId_participantId_date: {
              activityId,
              participantId: entry.participantId,
              date,
            },
          },
          create: {
            activityId,
            participantId: entry.participantId,
            date,
            status: entry.status ?? AttendanceStatus.PRESENT,
            notes: entry.notes,
            recordedById: actor.id,
          },
          update: {
            status: entry.status ?? AttendanceStatus.PRESENT,
            notes: entry.notes,
            recordedById: actor.id,
          },
        }),
      ),
    );

    return this.sessionSheet(activityId, dto.date, actor);
  }

  /** Everyone recorded for one activity on one date. */
  async sessionSheet(activityId: string, dateInput: string, actor: AuthUser) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: {
        id: true,
        title: true,
        branchId: true,
        slots: {
          select: { weekday: true, startTime: true, durationMinutes: true },
        },
        capacity: true,
      },
    });

    if (!activity) {
      throw new NotFoundException(`Activity with id ${activityId} not found`);
    }

    assertBranchAccess(actor, activity.branchId);

    const date = toDateOnly(dateInput);
    const slot = activity.slots.find(
      (entry) => entry.weekday === isoWeekday(date),
    );

    const records = await this.prisma.attendance.findMany({
      where: { activityId, date },
      include: attendanceInclude,
      orderBy: [{ participant: { lastName: 'asc' } }],
    });

    return {
      activity: {
        id: activity.id,
        title: activity.title,
        // Each weekday has its own time, so report the slot for this date.
        startTime: slot?.startTime ?? null,
        durationMinutes: slot?.durationMinutes ?? null,
        capacity: activity.capacity,
      },
      date: formatDateOnly(date),
      total: records.length,
      records,
    };
  }

  async findAll(query: QueryAttendanceDto, actor: AuthUser) {
    const {
      page = 1,
      limit = 10,
      order = 'desc',
      activityId,
      participantId,
      branchId,
      status,
      from,
      to,
    } = query;

    const scope = branchScope(actor, branchId);

    const where: Prisma.AttendanceWhereInput = {
      ...(scope.branchId && { activity: { branchId: scope.branchId } }),
      ...(activityId && { activityId }),
      ...(participantId && { participantId }),
      ...(status && { status }),
      ...((from || to) && {
        date: {
          ...(from && { gte: toDateOnly(from) }),
          ...(to && { lte: toDateOnly(to) }),
        },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: attendanceInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { date: order },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return { data, meta: buildMeta(total, page, limit) };
  }

  async remove(id: string, actor: AuthUser) {
    const record = await this.prisma.attendance.findUnique({
      where: { id },
      select: { id: true, activity: { select: { branchId: true } } },
    });

    if (!record) {
      throw new NotFoundException(`Attendance record with id ${id} not found`);
    }

    assertBranchAccess(actor, record.activity.branchId);

    await this.prisma.attendance.delete({ where: { id } });
    return { message: 'Attendance record removed', id };
  }

  private assertDateIsScheduled(
    activity: {
      slots: { weekday: number }[];
      startDate: Date;
      endDate: Date | null;
    },
    date: Date,
  ) {
    if (date < activity.startDate) {
      throw new BadRequestException(
        `This activity only starts on ${formatDateOnly(activity.startDate)}`,
      );
    }

    if (activity.endDate && date > activity.endDate) {
      throw new BadRequestException(
        `This activity ended on ${formatDateOnly(activity.endDate)}`,
      );
    }

    const weekdays = activity.slots.map((slot) => slot.weekday);

    if (!weekdays.includes(isoWeekday(date))) {
      throw new BadRequestException(
        `${formatDateOnly(date)} is not one of this activity's scheduled weekdays (${weekdays.join(', ')})`,
      );
    }
  }
}
