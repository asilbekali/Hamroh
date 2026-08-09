import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta } from '../common/dto/pagination.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { QueryActivityDto } from './dto/query-activity.dto';

const activityInclude = {
  category: { select: { id: true, name: true, slug: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  _count: { select: { registrations: true } },
} satisfies Prisma.ActivityInclude;

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateActivityDto, createdById: string) {
    this.assertDateRange(dto.startDate, dto.endDate);
    await this.assertCategory(dto.categoryId);

    return this.prisma.activity.create({
      data: {
        ...dto,
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        createdById,
      },
      include: activityInclude,
    });
  }

  async findAll(query: QueryActivityDto) {
    const {
      page = 1,
      limit = 10,
      search,
      order = 'desc',
      status,
      recurrence,
      categoryId,
    } = query;

    const where: Prisma.ActivityWhereInput = {
      ...(status && { status }),
      ...(recurrence && { recurrence }),
      ...(categoryId && { categoryId }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
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

  async findOne(id: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: {
        ...activityInclude,
        registrations: {
          include: {
            participant: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });

    if (!activity) {
      throw new NotFoundException(`Activity with id ${id} not found`);
    }

    return activity;
  }

  async update(id: string, dto: UpdateActivityDto) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });

    if (!activity) {
      throw new NotFoundException(`Activity with id ${id} not found`);
    }

    this.assertDateRange(
      dto.startDate ?? activity.startDate?.toISOString(),
      dto.endDate ?? activity.endDate?.toISOString(),
    );
    await this.assertCategory(dto.categoryId);

    return this.prisma.activity.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
      },
      include: activityInclude,
    });
  }

  async remove(id: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });

    if (!activity) {
      throw new NotFoundException(`Activity with id ${id} not found`);
    }

    await this.prisma.activity.delete({ where: { id } });
    return { message: 'Activity deleted successfully', id };
  }

  private assertDateRange(startDate?: string | null, endDate?: string | null) {
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException('endDate must be after startDate');
    }
  }

  private async assertCategory(categoryId?: string) {
    if (!categoryId) return;

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${categoryId} not found`);
    }
  }
}
