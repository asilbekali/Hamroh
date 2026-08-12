import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  assertBranchAccess,
  branchScope,
  isSuperAdmin,
  resolveBranchIdForCreate,
} from '../common/utils/scope.util';
import { calculateAge, toDateOnly } from '../common/utils/date.util';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { QueryParticipantDto } from './dto/query-participant.dto';

const participantInclude = {
  branch: { select: { id: true, name: true, region: true } },
  createdBy: { select: { id: true, username: true, fullName: true } },
  _count: { select: { attendances: true } },
} satisfies Prisma.ParticipantInclude;

@Injectable()
export class ParticipantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateParticipantDto, actor: AuthUser) {
    const branchId = resolveBranchIdForCreate(actor, dto.branchId);
    await this.assertBranchUsable(branchId);

    const participant = await this.prisma.participant.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        birthDate: toDateOnly(dto.birthDate),
        phone: dto.phone,
        address: dto.address,
        district: dto.district,
        mahalla: dto.mahalla,
        notes: dto.notes,
        isActive: dto.isActive,
        branchId,
        createdById: actor.id,
      },
      include: participantInclude,
    });

    return this.decorate(participant);
  }

  async findAll(query: QueryParticipantDto, actor: AuthUser) {
    const {
      page = 1,
      limit = 10,
      search,
      order = 'desc',
      sortBy = 'createdAt',
      branchId,
      region,
      activityId,
      isActive,
    } = query;

    if (region && !isSuperAdmin(actor)) {
      throw new ForbiddenException('Only super admins can filter by region');
    }

    const where: Prisma.ParticipantWhereInput = {
      // Removed people are hidden everywhere but the reports, which read the
      // rows directly so a past period never loses the visits behind it.
      deletedAt: null,
      ...branchScope(actor, branchId),
      ...(region && { branch: { region } }),
      ...(isActive !== undefined && { isActive }),
      ...(activityId && { attendances: { some: { activityId } } }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { middleName: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
          { address: { contains: search, mode: 'insensitive' as const } },
          { district: { contains: search, mode: 'insensitive' as const } },
          { mahalla: { contains: search, mode: 'insensitive' as const } },
          // A purely numeric search is treated as a lookup by № as well.
          ...(/^\d+$/.test(search.trim())
            ? [{ serialNumber: Number(search.trim()) }]
            : []),
        ],
      }),
    };

    // Secondary keys keep the ordering stable so the row numbers below do not
    // shuffle between pages when the primary key ties.
    const orderBy: Prisma.ParticipantOrderByWithRelationInput[] =
      sortBy === 'lastName'
        ? [{ lastName: order }, { firstName: order }, { id: 'asc' }]
        : [{ [sortBy]: order }, { id: 'asc' }];

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.participant.findMany({
        where,
        include: participantInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      this.prisma.participant.count({ where }),
    ]);

    return {
      // `no` is the participant's own stable number, so it stays the same
      // whatever the sort or page — which is what makes it searchable.
      data: rows.map((row) => ({ no: row.serialNumber, ...this.decorate(row) })),
      meta: buildMeta(total, page, limit),
    };
  }

  async findOne(id: string, actor: AuthUser) {
    const participant = await this.prisma.participant.findUnique({
      where: { id },
      include: {
        ...participantInclude,
        attendances: {
          take: 50,
          orderBy: { date: 'desc' },
          include: {
            activity: {
              select: {
                id: true,
                title: true,
                slots: { select: { weekday: true, startTime: true } },
              },
            },
          },
        },
      },
    });

    if (!participant || participant.deletedAt) {
      throw new NotFoundException(`Participant with id ${id} not found`);
    }

    assertBranchAccess(actor, participant.branchId);

    return this.decorate(participant);
  }

  async update(id: string, dto: UpdateParticipantDto, actor: AuthUser) {
    const existing = await this.prisma.participant.findUnique({
      where: { id },
      select: { id: true, branchId: true, deletedAt: true },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Participant with id ${id} not found`);
    }

    assertBranchAccess(actor, existing.branchId);

    let branchId: string | undefined;
    if (dto.branchId && dto.branchId !== existing.branchId) {
      if (!isSuperAdmin(actor)) {
        throw new ForbiddenException(
          'Only a super admin can move someone to another branch',
        );
      }

      await this.assertBranchUsable(dto.branchId);
      branchId = dto.branchId;
    }

    const participant = await this.prisma.participant.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.middleName !== undefined && { middleName: dto.middleName }),
        ...(dto.birthDate && { birthDate: toDateOnly(dto.birthDate) }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.district !== undefined && { district: dto.district }),
        ...(dto.mahalla !== undefined && { mahalla: dto.mahalla }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(branchId && { branchId }),
      },
      include: participantInclude,
    });

    return this.decorate(participant);
  }

  /**
   * Takes the person off the working lists without touching their history.
   *
   * A hard delete would cascade their attendance rows away, and those rows are
   * what the reports are made of — a period already reported on would quietly
   * change. So the row is stamped instead, and only a manual DELETE in the
   * database can remove it for good.
   */
  async remove(id: string, actor: AuthUser) {
    const existing = await this.prisma.participant.findUnique({
      where: { id },
      select: { id: true, branchId: true, deletedAt: true },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Participant with id ${id} not found`);
    }

    assertBranchAccess(actor, existing.branchId);

    await this.prisma.participant.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.id, isActive: false },
    });

    return {
      message:
        'Participant removed. Their visits stay in the reports and can only be erased directly in the database.',
      id,
    };
  }

  /** Adds the derived display fields the list and detail views need. */
  private decorate<
    T extends {
      firstName: string;
      lastName: string;
      middleName: string | null;
      birthDate: Date;
    },
  >(participant: T) {
    return {
      ...participant,
      fullName: [
        participant.lastName,
        participant.firstName,
        participant.middleName,
      ]
        .filter(Boolean)
        .join(' '),
      age: calculateAge(participant.birthDate),
    };
  }

  private async assertBranchUsable(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, isActive: true },
    });

    if (!branch) {
      throw new NotFoundException(`Branch with id ${branchId} not found`);
    }

    if (!branch.isActive) {
      throw new BadRequestException('This branch is deactivated');
    }
  }
}
