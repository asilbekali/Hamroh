import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta } from '../common/dto/pagination.dto';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { QueryParticipantDto } from './dto/query-participant.dto';

@Injectable()
export class ParticipantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateParticipantDto) {
    const email = dto.email.toLowerCase();

    const exists = await this.prisma.participant.findUnique({
      where: { email },
    });

    if (exists) {
      throw new ConflictException(
        'A participant with this email already exists',
      );
    }

    return this.prisma.participant.create({
      data: {
        ...dto,
        email,
        ...(dto.dateOfBirth && { dateOfBirth: new Date(dto.dateOfBirth) }),
      },
    });
  }

  async findAll(query: QueryParticipantDto) {
    const {
      page = 1,
      limit = 10,
      search,
      order = 'desc',
      isActive,
      eventId,
      activityId,
    } = query;

    const where: Prisma.ParticipantWhereInput = {
      ...(isActive !== undefined && { isActive }),
      ...((eventId || activityId) && {
        registrations: {
          some: {
            ...(eventId && { eventId }),
            ...(activityId && { activityId }),
          },
        },
      }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.participant.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: order },
        include: { _count: { select: { registrations: true } } },
      }),
      this.prisma.participant.count({ where }),
    ]);

    return { data, meta: buildMeta(total, page, limit) };
  }

  async findOne(id: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { id },
      include: {
        registrations: {
          include: {
            event: { select: { id: true, title: true, startDate: true } },
            activity: { select: { id: true, title: true } },
          },
        },
      },
    });

    if (!participant) {
      throw new NotFoundException(`Participant with id ${id} not found`);
    }

    return participant;
  }

  async update(id: string, dto: UpdateParticipantDto) {
    await this.findOne(id);

    if (dto.email) {
      const email = dto.email.toLowerCase();
      const taken = await this.prisma.participant.findFirst({
        where: { email, NOT: { id } },
      });

      if (taken) {
        throw new ConflictException(
          'A participant with this email already exists',
        );
      }

      dto.email = email;
    }

    return this.prisma.participant.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.dateOfBirth && { dateOfBirth: new Date(dto.dateOfBirth) }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.participant.delete({ where: { id } });
    return { message: 'Participant deleted successfully', id };
  }
}
