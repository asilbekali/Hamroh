import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta } from '../common/dto/pagination.dto';
import { slugify } from '../common/utils/slug.util';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventDto } from './dto/query-event.dto';

const eventInclude = {
  category: { select: { id: true, name: true, slug: true } },
  coordinator: { select: { id: true, fullName: true, email: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  _count: { select: { registrations: true } },
} satisfies Prisma.EventInclude;

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEventDto, createdById: string) {
    this.assertDateRange(dto.startDate, dto.endDate);
    await this.assertRelations(dto.categoryId, dto.coordinatorId);

    return this.prisma.event.create({
      data: {
        ...dto,
        slug: await this.uniqueSlug(dto.title),
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        createdById,
      },
      include: eventInclude,
    });
  }

  async findAll(query: QueryEventDto) {
    const {
      page = 1,
      limit = 10,
      search,
      order = 'desc',
      status,
      categoryId,
      coordinatorId,
      isPublished,
      from,
      to,
    } = query;

    const where: Prisma.EventWhereInput = {
      ...(status && { status }),
      ...(categoryId && { categoryId }),
      ...(coordinatorId && { coordinatorId }),
      ...(isPublished !== undefined && { isPublished }),
      ...((from || to) && {
        startDate: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
          { location: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        include: eventInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { startDate: order },
      }),
      this.prisma.event.count({ where }),
    ]);

    return { data, meta: buildMeta(total, page, limit) };
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        ...eventInclude,
        registrations: {
          include: {
            participant: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Event with id ${id} not found`);
    }

    return event;
  }

  async update(id: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({ where: { id } });

    if (!event) {
      throw new NotFoundException(`Event with id ${id} not found`);
    }

    const startDate = dto.startDate ?? event.startDate.toISOString();
    const endDate = dto.endDate ?? event.endDate.toISOString();
    this.assertDateRange(startDate, endDate);
    await this.assertRelations(dto.categoryId, dto.coordinatorId);

    return this.prisma.event.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.title && { slug: await this.uniqueSlug(dto.title, id) }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
      },
      include: eventInclude,
    });
  }

  async remove(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });

    if (!event) {
      throw new NotFoundException(`Event with id ${id} not found`);
    }

    await this.prisma.event.delete({ where: { id } });
    return { message: 'Event deleted successfully', id };
  }

  private assertDateRange(startDate: string, endDate: string) {
    if (new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException('endDate must be after startDate');
    }
  }

  private async assertRelations(categoryId?: string, coordinatorId?: string) {
    if (categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });

      if (!category) {
        throw new NotFoundException(`Category with id ${categoryId} not found`);
      }
    }

    if (coordinatorId) {
      const coordinator = await this.prisma.user.findUnique({
        where: { id: coordinatorId },
      });

      if (!coordinator) {
        throw new NotFoundException(
          `Coordinator with id ${coordinatorId} not found`,
        );
      }
    }
  }

  private async uniqueSlug(title: string, ignoreId?: string) {
    const base = slugify(title);
    let slug = base;
    let suffix = 1;

    while (
      await this.prisma.event.findFirst({
        where: { slug, ...(ignoreId && { NOT: { id: ignoreId } }) },
        select: { id: true },
      })
    ) {
      slug = `${base}-${++suffix}`;
    }

    return slug;
  }
}
