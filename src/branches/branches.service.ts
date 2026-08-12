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
import { isSuperAdmin, requireOwnBranch } from '../common/utils/scope.util';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { QueryBranchDto } from './dto/query-branch.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';

const branchInclude = {
  // Removed people and activities keep their rows for the reports, so the
  // counts shown on a branch have to skip them to stay truthful.
  _count: {
    select: {
      participants: { where: { deletedAt: null } },
      activities: { where: { deletedAt: null } },
      staff: true,
    },
  },
} satisfies Prisma.BranchInclude;

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBranchDto) {
    await this.assertNameFree(dto.name);

    return this.prisma.branch.create({ data: dto, include: branchInclude });
  }

  async findAll(query: QueryBranchDto, user: AuthUser) {
    const {
      page = 1,
      limit = 10,
      search,
      order = 'desc',
      region,
      isActive,
    } = query;

    const where: Prisma.BranchWhereInput = {
      // Admins and trainers only ever see the branch they belong to.
      ...(isSuperAdmin(user) ? {} : { id: requireOwnBranch(user) }),
      ...(region && { region }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { address: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        include: branchInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: order },
      }),
      this.prisma.branch.count({ where }),
    ]);

    return { data, meta: buildMeta(total, page, limit) };
  }

  async findOne(id: string, user: AuthUser) {
    if (!isSuperAdmin(user) && requireOwnBranch(user) !== id) {
      throw new NotFoundException(`Branch with id ${id} not found`);
    }

    return this.loadDetail(id);
  }

  async update(id: string, dto: UpdateBranchDto) {
    await this.getOrThrow(id);

    if (dto.name) {
      await this.assertNameFree(dto.name, id);
    }

    return this.prisma.branch.update({
      where: { id },
      data: dto,
      include: branchInclude,
    });
  }

  /** Attaches admins/trainers to this branch, moving them off any previous one. */
  async assignStaff(id: string, dto: AssignStaffDto) {
    await this.getOrThrow(id);

    const staff = await this.prisma.user.findMany({
      where: { id: { in: dto.userIds } },
      select: { id: true, role: true, username: true },
    });

    if (staff.length !== dto.userIds.length) {
      throw new NotFoundException('One or more staff accounts were not found');
    }

    const superAdmin = staff.find((member) => member.role === Role.SUPER_ADMIN);
    if (superAdmin) {
      throw new BadRequestException(
        `${superAdmin.username} is a super admin and cannot be tied to a branch`,
      );
    }

    await this.prisma.user.updateMany({
      where: { id: { in: dto.userIds } },
      data: { branchId: id },
    });

    return this.loadDetail(id);
  }

  /** Detaches a single staff account from this branch. */
  async removeStaff(id: string, userId: string) {
    await this.getOrThrow(id);

    const member = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, branchId: true },
    });

    if (!member || member.branchId !== id) {
      throw new NotFoundException('This staff account is not in this branch');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { branchId: null },
    });

    return {
      message: 'Staff member detached from branch',
      branchId: id,
      userId,
    };
  }

  async remove(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: branchInclude,
    });

    if (!branch) {
      throw new NotFoundException(`Branch with id ${id} not found`);
    }

    if (branch._count.participants > 0 || branch._count.activities > 0) {
      throw new ConflictException(
        'This branch still has participants or activities. Move them first, or deactivate the branch instead.',
      );
    }

    // Rows removed from the working lists are still here, holding up the
    // reports. Dropping the branch would take them — and the history behind
    // them — with it, so the branch can only be deactivated from now on.
    const [retiredParticipants, retiredActivities] = await Promise.all([
      this.prisma.participant.count({
        where: { branchId: id, deletedAt: { not: null } },
      }),
      this.prisma.activity.count({
        where: { branchId: id, deletedAt: { not: null } },
      }),
    ]);

    if (retiredParticipants > 0 || retiredActivities > 0) {
      throw new ConflictException(
        'This branch holds removed participants or activities that the reports are built from. Deactivate the branch instead — its history can only be erased directly in the database.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { branchId: id },
        data: { branchId: null },
      }),
      this.prisma.branch.delete({ where: { id } }),
    ]);

    return { message: 'Branch deleted successfully', id };
  }

  private async loadDetail(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        ...branchInclude,
        staff: {
          where: { isActive: true },
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
            phone: true,
          },
          orderBy: { role: 'asc' },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException(`Branch with id ${id} not found`);
    }

    return branch;
  }

  private async getOrThrow(id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });

    if (!branch) {
      throw new NotFoundException(`Branch with id ${id} not found`);
    }

    return branch;
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const taken = await this.prisma.branch.findFirst({
      where: { name, ...(exceptId && { NOT: { id: exceptId } }) },
    });

    if (taken) {
      throw new ConflictException('A branch with this name already exists');
    }
  }
}
