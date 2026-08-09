import { Injectable } from '@nestjs/common';
import { Workbook, Worksheet } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { branchScope } from '../common/utils/scope.util';
import {
  calculateAge,
  formatDateOnly,
  isoWeekday,
  PERIOD_LABELS,
  periodRange,
} from '../common/utils/date.util';
import { QueryReportDto } from './dto/query-report.dto';

const WEEKDAY_LABELS = ['Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan', 'Yak'];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Participants report: who is on the books and how often they showed up. */
  async participants(query: QueryReportDto, actor: AuthUser) {
    const period = query.period ?? 'month';
    const { from, to } = periodRange(period);
    const scope = branchScope(actor, query.branchId);

    const rows = await this.prisma.participant.findMany({
      where: scope,
      include: {
        branch: { select: { name: true, region: true } },
        _count: {
          select: { attendances: { where: { date: { gte: from, lte: to } } } },
        },
      },
      orderBy: [{ branch: { name: 'asc' } }, { lastName: 'asc' }],
    });

    const data = rows.map((row, index) => ({
      no: index + 1,
      fullName: [row.lastName, row.firstName, row.middleName]
        .filter(Boolean)
        .join(' '),
      birthDate: formatDateOnly(row.birthDate),
      age: calculateAge(row.birthDate),
      phone: row.phone,
      address: row.address,
      branch: row.branch.name,
      region: row.branch.region,
      registeredAt: formatDateOnly(row.createdAt),
      isNewInPeriod: row.createdAt >= from && row.createdAt <= to,
      visitsInPeriod: row._count.attendances,
      status: row.isActive ? 'Faol' : 'Nofaol',
    }));

    return {
      period,
      periodLabel: PERIOD_LABELS[period],
      from: formatDateOnly(from),
      to: formatDateOnly(to),
      total: data.length,
      newInPeriod: data.filter((row) => row.isNewInPeriod).length,
      data,
    };
  }

  /**
   * Visits report: one row per recorded attendance, not per person.
   *
   * The participants report answers "who is on the books and how often did they
   * come"; this one answers "who came, when". The same person appears once for
   * every session they turned up to — Monday 15:00 and Thursday 17:00 are two
   * separate lines.
   */
  async visits(query: QueryReportDto, actor: AuthUser) {
    const period = query.period ?? 'month';
    const { from, to } = periodRange(period);
    const scope = branchScope(actor, query.branchId);

    const rows = await this.prisma.attendance.findMany({
      where: {
        date: { gte: from, lte: to },
        ...(scope.branchId && { activity: { branchId: scope.branchId } }),
      },
      include: {
        participant: {
          select: {
            serialNumber: true,
            firstName: true,
            lastName: true,
            middleName: true,
            phone: true,
          },
        },
        activity: {
          select: {
            title: true,
            branch: { select: { name: true, region: true } },
            trainer: { select: { fullName: true } },
            slots: { select: { weekday: true, startTime: true } },
          },
        },
      },
      orderBy: [{ date: 'desc' }, { participant: { lastName: 'asc' } }],
    });

    const data = rows.map((row, index) => {
      const weekday = isoWeekday(row.date);
      // Each weekday has its own time, so report the one this date ran at.
      const slot = row.activity.slots.find((entry) => entry.weekday === weekday);

      return {
        no: index + 1,
        userNo: row.participant.serialNumber,
        fullName: [
          row.participant.lastName,
          row.participant.firstName,
          row.participant.middleName,
        ]
          .filter(Boolean)
          .join(' '),
        phone: row.participant.phone,
        date: formatDateOnly(row.date),
        weekday: WEEKDAY_LABELS[weekday - 1] ?? String(weekday),
        startTime: slot?.startTime ?? '—',
        activity: row.activity.title,
        trainer: row.activity.trainer?.fullName ?? '—',
        branch: row.activity.branch.name,
        region: row.activity.branch.region,
        status: row.status,
      };
    });

    return {
      period,
      periodLabel: PERIOD_LABELS[period],
      from: formatDateOnly(from),
      to: formatDateOnly(to),
      total: data.length,
      uniqueParticipants: new Set(rows.map((row) => row.participantId)).size,
      data,
    };
  }

  async visitsWorkbook(query: QueryReportDto, actor: AuthUser) {
    const report = await this.visits(query, actor);
    const workbook = this.createWorkbook();

    const sheet = workbook.addWorksheet('Tashriflar');
    this.addTitle(sheet, 'Tashriflar hisoboti', report, 11);

    sheet.addRow([
      '№',
      'Foydalanuvchi №',
      'F.I.Sh',
      'Telefon',
      'Sana',
      'Hafta kuni',
      'Vaqt',
      'Toʻgarak',
      'Trener',
      'Filial',
      'Holati',
    ]);
    this.styleHeader(sheet, sheet.lastRow!.number);

    for (const row of report.data) {
      sheet.addRow([
        row.no,
        row.userNo,
        row.fullName,
        row.phone,
        row.date,
        row.weekday,
        row.startTime,
        row.activity,
        row.trainer,
        row.branch,
        row.status,
      ]);
    }

    this.autoFit(sheet);

    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: `tashriflar-${report.period}-${report.to}.xlsx`,
    };
  }

  /** Activities report: how many sessions ran and how well attended they were. */
  async activities(query: QueryReportDto, actor: AuthUser) {
    const period = query.period ?? 'month';
    const { from, to } = periodRange(period);
    const scope = branchScope(actor, query.branchId);

    const rows = await this.prisma.activity.findMany({
      where: scope,
      include: {
        branch: { select: { name: true, region: true } },
        trainer: { select: { fullName: true } },
        slots: {
          select: { weekday: true, startTime: true, durationMinutes: true },
          orderBy: { weekday: 'asc' },
        },
        attendances: {
          where: { date: { gte: from, lte: to } },
          select: { date: true, participantId: true },
        },
      },
      orderBy: [{ branch: { name: 'asc' } }, { title: 'asc' }],
    });

    const data = rows.map((row, index) => {
      const heldSessions = new Set(
        row.attendances.map((record) => formatDateOnly(record.date)),
      );
      const uniqueParticipants = new Set(
        row.attendances.map((record) => record.participantId),
      );

      return {
        no: index + 1,
        title: row.title,
        branch: row.branch.name,
        region: row.branch.region,
        trainer: row.trainer?.fullName ?? '—',
        // Each weekday can start at its own time, so the schedule reads
        // "Dush 13:00, Jum 16:00" rather than one time for the whole week.
        schedule: row.slots
          .map(
            (slot) =>
              `${WEEKDAY_LABELS[slot.weekday - 1] ?? slot.weekday} ${slot.startTime}`,
          )
          .join(', '),
        startTime: row.slots[0]?.startTime ?? '—',
        durationMinutes: row.slots[0]?.durationMinutes ?? 0,
        scheduledSessions: this.countScheduledSessions(row, from, to),
        heldSessions: heldSessions.size,
        totalVisits: row.attendances.length,
        uniqueParticipants: uniqueParticipants.size,
        averagePerSession: heldSessions.size
          ? Number((row.attendances.length / heldSessions.size).toFixed(1))
          : 0,
        status: row.isActive ? 'Faol' : 'Nofaol',
      };
    });

    return {
      period,
      periodLabel: PERIOD_LABELS[period],
      from: formatDateOnly(from),
      to: formatDateOnly(to),
      total: data.length,
      totalVisits: data.reduce((sum, row) => sum + row.totalVisits, 0),
      data,
    };
  }

  async participantsWorkbook(query: QueryReportDto, actor: AuthUser) {
    const report = await this.participants(query, actor);
    const workbook = this.createWorkbook();

    const sheet = workbook.addWorksheet('Ishtirokchilar');
    this.addTitle(sheet, 'Ishtirokchilar hisoboti', report, 12);

    sheet.addRow([
      '№',
      'F.I.Sh',
      'Tugʻilgan sana',
      'Yosh',
      'Telefon',
      'Manzil',
      'Filial',
      'Viloyat',
      'Roʻyxatga olingan',
      'Davrda yangi',
      'Tashriflar (davrda)',
      'Holati',
    ]);
    this.styleHeader(sheet, sheet.lastRow!.number);

    for (const row of report.data) {
      sheet.addRow([
        row.no,
        row.fullName,
        row.birthDate,
        row.age,
        row.phone,
        row.address,
        row.branch,
        row.region,
        row.registeredAt,
        row.isNewInPeriod ? 'Ha' : '—',
        row.visitsInPeriod,
        row.status,
      ]);
    }

    this.autoFit(sheet);
    this.addBranchSummary(workbook, report.data);

    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: `ishtirokchilar-${report.period}-${report.to}.xlsx`,
    };
  }

  async activitiesWorkbook(query: QueryReportDto, actor: AuthUser) {
    const report = await this.activities(query, actor);
    const workbook = this.createWorkbook();

    const sheet = workbook.addWorksheet('Faoliyatlar');
    this.addTitle(sheet, 'Faoliyatlar hisoboti', report, 14);

    sheet.addRow([
      '№',
      'Nomi',
      'Filial',
      'Viloyat',
      'Trener',
      'Kunlar',
      'Vaqt',
      'Davomiyligi (daq.)',
      'Rejadagi mashgʻulot',
      'Oʻtkazilgan',
      'Jami tashrif',
      'Noyob ishtirokchi',
      'Oʻrtacha davomat',
      'Holati',
    ]);
    this.styleHeader(sheet, sheet.lastRow!.number);

    for (const row of report.data) {
      sheet.addRow([
        row.no,
        row.title,
        row.branch,
        row.region,
        row.trainer,
        row.schedule,
        row.startTime,
        row.durationMinutes,
        row.scheduledSessions,
        row.heldSessions,
        row.totalVisits,
        row.uniqueParticipants,
        row.averagePerSession,
        row.status,
      ]);
    }

    this.autoFit(sheet);

    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: `faoliyatlar-${report.period}-${report.to}.xlsx`,
    };
  }

  /** How many sessions the schedule called for inside [from, to]. */
  private countScheduledSessions(
    activity: {
      slots: { weekday: number }[];
      startDate: Date;
      endDate: Date | null;
    },
    from: Date,
    to: Date,
  ): number {
    const start = activity.startDate > from ? activity.startDate : from;
    const end =
      activity.endDate && activity.endDate < to ? activity.endDate : to;

    let count = 0;
    for (
      const cursor = new Date(
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth(),
          start.getUTCDate(),
        ),
      );
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      if (activity.slots.some((slot) => slot.weekday === isoWeekday(cursor))) {
        count += 1;
      }
    }

    return count;
  }

  private createWorkbook() {
    const workbook = new Workbook();
    workbook.creator = 'Hamroh Admin Panel';
    workbook.created = new Date();
    return workbook;
  }

  private addTitle(
    sheet: Worksheet,
    title: string,
    report: { periodLabel: string; from: string; to: string; total: number },
    columnCount: number,
  ) {
    sheet.addRow([title]);
    sheet.mergeCells(1, 1, 1, columnCount);
    sheet.getCell(1, 1).font = { size: 14, bold: true };

    sheet.addRow([
      `Davr: ${report.periodLabel}  (${report.from} — ${report.to})   Jami: ${report.total}`,
    ]);
    sheet.mergeCells(2, 1, 2, columnCount);
    sheet.getCell(2, 1).font = { italic: true, color: { argb: 'FF666666' } };

    sheet.addRow([]);
  }

  private styleHeader(sheet: Worksheet, rowNumber: number) {
    const row = sheet.getRow(rowNumber);
    row.font = { bold: true };
    row.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    row.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8EEF7' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFBFC9D9' } },
        left: { style: 'thin', color: { argb: 'FFBFC9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFBFC9D9' } },
        right: { style: 'thin', color: { argb: 'FFBFC9D9' } },
      };
    });
    sheet.views = [{ state: 'frozen', ySplit: rowNumber }];
  }

  private autoFit(sheet: Worksheet) {
    sheet.columns.forEach((column) => {
      let width = 10;
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        width = Math.max(width, cell.text.length + 2);
      });
      column.width = Math.min(width, 45);
    });
  }

  private addBranchSummary(
    workbook: Workbook,
    rows: {
      branch: string;
      region: string;
      isNewInPeriod: boolean;
      visitsInPeriod: number;
      status: string;
    }[],
  ) {
    const sheet = workbook.addWorksheet('Filiallar kesimida');
    sheet.addRow([
      'Filial',
      'Viloyat',
      'Jami',
      'Davrda yangi',
      'Faol',
      'Tashriflar',
    ]);
    this.styleHeader(sheet, 1);

    const grouped = new Map<
      string,
      {
        region: string;
        total: number;
        fresh: number;
        active: number;
        visits: number;
      }
    >();

    for (const row of rows) {
      const bucket = grouped.get(row.branch) ?? {
        region: row.region,
        total: 0,
        fresh: 0,
        active: 0,
        visits: 0,
      };

      bucket.total += 1;
      bucket.fresh += row.isNewInPeriod ? 1 : 0;
      bucket.active += row.status === 'Faol' ? 1 : 0;
      bucket.visits += row.visitsInPeriod;

      grouped.set(row.branch, bucket);
    }

    for (const [branch, bucket] of grouped) {
      sheet.addRow([
        branch,
        bucket.region,
        bucket.total,
        bucket.fresh,
        bucket.active,
        bucket.visits,
      ]);
    }

    this.autoFit(sheet);
  }
}
