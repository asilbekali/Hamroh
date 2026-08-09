import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta } from '../common/dto/pagination.dto';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { QueryRegistrationDto } from './dto/query-registration.dto';

const registrationInclude = {
  participant: { select: { id: true, fullName: true, email: true, phone: true } },
  event: { select: { id: true, title: true, startDate: true, endDate: true } },
  activity: { select: { id: true, title: true } },
} satisfies Prisma.RegistrationInclude;

@Injectable()
export class RegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRegistrationDto) {
    if (!dto.eventId && !dto.activityId) {
      throw new BadRequestException(
        'Either eventId or activityId must be provided',
      );
    }

    if (dto.eventId && dto.activityId) {
      throw new BadRequestException(
        'A registration cannot target both an event and an activity',
      );
    }

    const participant = await this.prisma.participant.findUnique({
      where: { id: dto.participantId },
    });

    if (!participant) {
      throw new NotFoundException(
        `Participant with id ${dto.participantId} not found`,
      );
    }

    if (dto.eventId) {
      await this.assertEventCapacity(dto.eventId);
    }

    if (dto.activityId) {
      await this.assertActivityCapacity(dto.activityId);
    }

    const duplicate = await this.prisma.registration.findFirst({
      where: {
        participantId: dto.participantId,
        ...(dto.eventId ? { eventId: dto.eventId } : { activityId: dto.activityId }),
      },
    });

    if (duplicate) {
      throw new ConflictException(
        'This participant is already registered for the selected item',
      );
    }

    return this.prisma.registration.create({
      data: dto,
      include: registrationInclude,
    });
  }

  async findAll(query: QueryRegistrationDto) {
    const {
      page = 1,
      limit = 10,
      order = 'desc',
      search,
      status,
      attendance,
      eventId,
      activityId,
      participantId,
    } = query;

    const where: Prisma.RegistrationWhereInput = {
      ...(status && { status }),
      ...(attendance && { attendance }),
      ...(eventId && { eventId }),
      ...(activityId && { activityId }),
      ...(participantId && { participantId }),
      ...(search && {
        participant: {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.registration.findMany({
        where,
        include: registrationInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: order },
      }),
      this.prisma.registration.count({ where }),
    ]);

    return { data, meta: buildMeta(total, page, limit) };
  }

  async findOne(id: string) {
    const registration = await this.prisma.registration.findUnique({
      where: { id },
      include: registrationInclude,
    });

    if (!registration) {
      throw new NotFoundException(`Registration with id ${id} not found`);
    }

    return registration;
  }

  async update(id: string, dto: UpdateRegistrationDto) {
    await this.findOne(id);

    return this.prisma.registration.update({
      where: { id },
      data: dto,
      include: registrationInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.registration.delete({ where: { id } });
    return { message: 'Registration deleted successfully', id };
  }

  private async assertEventCapacity(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        _count: {
          select: {
            registrations: {
              where: { status: { not: RegistrationStatus.CANCELLED } },
            },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Event with id ${eventId} not found`);
    }

    if (
      event.registrationLimit !== null &&
      event._count.registrations >= event.registrationLimit
    ) {
      throw new ConflictException('This event has reached its registration limit');
    }
  }

  private async assertActivityCapacity(activityId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      include: {
        _count: {
          select: {
            registrations: {
              where: { status: { not: RegistrationStatus.CANCELLED } },
            },
          },
        },
      },
    });

    if (!activity) {
      throw new NotFoundException(`Activity with id ${activityId} not found`);
    }

    if (
      activity.capacity !== null &&
      activity._count.registrations >= activity.capacity
    ) {
      throw new ConflictException('This activity has reached its capacity');
    }
  }
}
