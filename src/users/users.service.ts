import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  assertBranchAccess,
  branchScope,
  isSuperAdmin,
  requireOwnBranch,
} from '../common/utils/scope.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

const SALT_ROUNDS = 10;

const userSelect = {
  id: true,
  username: true,
  fullName: true,
  phone: true,
  role: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, name: true, region: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto, actor: AuthUser) {
    const username = dto.username.toLowerCase();
    const role = dto.role ?? Role.ADMIN;

    this.assertMayCreateRole(actor, role);

    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) {
      throw new ConflictException('A user with this username already exists');
    }

    const branchId = await this.resolveBranchForRole(actor, role, dto.branchId);

    return this.prisma.user.create({
      data: {
        username,
        fullName: dto.fullName,
        phone: dto.phone,
        role,
        isActive: dto.isActive,
        branchId,
        password: await bcrypt.hash(dto.password, SALT_ROUNDS),
      },
      select: userSelect,
    });
  }

  async findAll(query: QueryUserDto, actor: AuthUser) {
    const {
      page = 1,
      limit = 10,
      search,
      order = 'desc',
      role,
      branchId,
      isActive,
    } = query;

    const where: Prisma.UserWhereInput = {
      ...branchScope(actor, branchId),
      ...(role && { role }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' as const } },
          { username: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: order },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, meta: buildMeta(total, page, limit) };
  }

  async findOne(id: string, actor: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    // A staff member may always read their own record.
    if (user.id !== actor.id) {
      assertBranchAccess(actor, user.branch?.id ?? null);
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
    const target = await this.findOne(id, actor);

    if (dto.role && dto.role !== target.role) {
      this.assertMayCreateRole(actor, dto.role);

      if (target.role === Role.SUPER_ADMIN) {
        throw new ForbiddenException('A super admin role cannot be changed');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.password && {
          password: await bcrypt.hash(dto.password, SALT_ROUNDS),
        }),
      },
      select: userSelect,
    });
  }

  async remove(id: string, actor: AuthUser) {
    const target = await this.findOne(id, actor);

    if (target.id === actor.id) {
      throw new BadRequestException('You cannot delete your own account');
    }

    if (target.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Super admin accounts cannot be deleted');
    }

    await this.prisma.user.delete({ where: { id } });
    return { message: 'User deleted successfully', id };
  }

  /** Trainers of a branch, used when picking who runs an activity. */
  async findTrainers(actor: AuthUser, branchId?: string) {
    return this.prisma.user.findMany({
      where: {
        role: Role.TRAINER,
        isActive: true,
        ...branchScope(actor, branchId),
      },
      select: userSelect,
      orderBy: { fullName: 'asc' },
    });
  }

  private assertMayCreateRole(actor: AuthUser, role: Role) {
    if (role === Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Super admin accounts can only be provisioned by the seed script',
      );
    }

    if (isSuperAdmin(actor)) {
      return;
    }

    if (role !== Role.TRAINER) {
      throw new ForbiddenException(
        'Branch admins may only create trainer accounts',
      );
    }
  }

  private async resolveBranchForRole(
    actor: AuthUser,
    role: Role,
    requestedBranchId?: string,
  ): Promise<string> {
    const branchId = isSuperAdmin(actor)
      ? requestedBranchId
      : requireOwnBranch(actor);

    if (!branchId) {
      throw new BadRequestException(
        `branchId is required when creating a ${role} account`,
      );
    }

    if (
      !isSuperAdmin(actor) &&
      requestedBranchId &&
      requestedBranchId !== branchId
    ) {
      throw new ForbiddenException(
        'You can only create accounts inside your own branch',
      );
    }

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

    return branch.id;
  }
}
