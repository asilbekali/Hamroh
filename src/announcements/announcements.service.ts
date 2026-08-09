import { Injectable, NotFoundException } from '@nestjs/common';
import { AnnouncementStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta } from '../common/dto/pagination.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { QueryAnnouncementDto } from './dto/query-announcement.dto';

const announcementInclude = {
  author: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.AnnouncementInclude;

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateAnnouncementDto, authorId: string) {
    return this.prisma.announcement.create({
      data: {
        ...dto,
        authorId,
        ...(dto.status === AnnouncementStatus.PUBLISHED && {
          publishedAt: new Date(),
        }),
      },
      include: announcementInclude,
    });
  }

  async findAll(query: QueryAnnouncementDto) {
    const { page = 1, limit = 10, search, order = 'desc', status } = query;

    const where: Prisma.AnnouncementWhereInput = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { body: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        include: announcementInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: order },
      }),
      this.prisma.announcement.count({ where }),
    ]);

    return { data, meta: buildMeta(total, page, limit) };
  }

  async findOne(id: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      include: announcementInclude,
    });

    if (!announcement) {
      throw new NotFoundException(`Announcement with id ${id} not found`);
    }

    return announcement;
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const announcement = await this.findOne(id);

    return this.prisma.announcement.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.status === AnnouncementStatus.PUBLISHED &&
          !announcement.publishedAt && { publishedAt: new Date() }),
      },
      include: announcementInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.announcement.delete({ where: { id } });
    return { message: 'Announcement deleted successfully', id };
  }
}
