import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AnnouncementStatus, Prisma, Role, TodoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { isSuperAdmin, requireOwnBranch } from '../common/utils/scope.util';
import {
  CreateAnnouncementDto,
  CreateTodoItemDto,
} from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { UpdateTodoItemDto } from './dto/update-todo-item.dto';
import {
  QueryAnnouncementDto,
  QueryTodoDto,
} from './dto/query-announcement.dto';

const todoInclude = {
  assignee: {
    select: {
      id: true,
      username: true,
      fullName: true,
      branch: { select: { id: true, name: true, region: true } },
    },
  },
} satisfies Prisma.TodoItemInclude;

const announcementInclude = {
  author: { select: { id: true, username: true, fullName: true } },
  branch: { select: { id: true, name: true, region: true } },
  todos: { include: todoInclude, orderBy: { position: 'asc' as const } },
} satisfies Prisma.AnnouncementInclude;

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAnnouncementDto, actor: AuthUser) {
    const branchId = this.resolveTargetBranch(actor, dto.branchId);

    for (const todo of dto.todos ?? []) {
      await this.assertAssignable(actor, todo.assigneeId);
    }

    return this.prisma.announcement.create({
      data: {
        title: dto.title,
        body: dto.body,
        status: dto.status,
        branchId,
        authorId: actor.id,
        ...(dto.status === AnnouncementStatus.PUBLISHED && {
          publishedAt: new Date(),
        }),
        ...(dto.todos?.length && {
          todos: {
            create: dto.todos.map((todo, index) => ({
              title: todo.title,
              description: todo.description,
              assigneeId: todo.assigneeId,
              position: index,
              ...(todo.dueDate && { dueDate: new Date(todo.dueDate) }),
            })),
          },
        }),
      },
      include: announcementInclude,
    });
  }

  async findAll(query: QueryAnnouncementDto, actor: AuthUser) {
    const {
      page = 1,
      limit = 10,
      search,
      order = 'desc',
      status,
      branchId,
    } = query;

    const where: Prisma.AnnouncementWhereInput = {
      ...this.visibilityFilter(actor, branchId),
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

  async findOne(id: string, actor: AuthUser) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      include: announcementInclude,
    });

    if (!announcement) {
      throw new NotFoundException(`Announcement with id ${id} not found`);
    }

    // A branch-wide announcement (branchId null) is visible to everyone.
    if (
      !isSuperAdmin(actor) &&
      announcement.branchId &&
      announcement.branchId !== requireOwnBranch(actor)
    ) {
      throw new NotFoundException(`Announcement with id ${id} not found`);
    }

    return announcement;
  }

  async update(id: string, dto: UpdateAnnouncementDto, actor: AuthUser) {
    const announcement = await this.findOne(id, actor);

    if (dto.branchId !== undefined && !isSuperAdmin(actor)) {
      throw new ForbiddenException(
        'Only a super admin can retarget an announcement',
      );
    }

    return this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.branchId !== undefined && { branchId: dto.branchId }),
        ...(dto.status === AnnouncementStatus.PUBLISHED &&
          !announcement.publishedAt && { publishedAt: new Date() }),
      },
      include: announcementInclude,
    });
  }

  async remove(id: string, actor: AuthUser) {
    await this.findOne(id, actor);
    await this.prisma.announcement.delete({ where: { id } });
    return { message: 'Announcement deleted successfully', id };
  }

  /** Appends a checklist item, optionally handing it to a branch admin. */
  async addTodo(
    announcementId: string,
    dto: CreateTodoItemDto,
    actor: AuthUser,
  ) {
    await this.findOne(announcementId, actor);
    await this.assertAssignable(actor, dto.assigneeId);

    const last = await this.prisma.todoItem.findFirst({
      where: { announcementId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    return this.prisma.todoItem.create({
      data: {
        announcementId,
        title: dto.title,
        description: dto.description,
        assigneeId: dto.assigneeId,
        position: (last?.position ?? -1) + 1,
        ...(dto.dueDate && { dueDate: new Date(dto.dueDate) }),
      },
      include: todoInclude,
    });
  }

  async updateTodo(todoId: string, dto: UpdateTodoItemDto, actor: AuthUser) {
    const todo = await this.getTodoForActor(todoId, actor);

    if (dto.assigneeId !== undefined) {
      if (!isSuperAdmin(actor)) {
        throw new ForbiddenException(
          'Only a super admin can reassign a todo item',
        );
      }

      await this.assertAssignable(actor, dto.assigneeId);
    }

    // A todo is work handed to a branch admin, so only that admin may move it
    // along the status track. A super admin writes and reassigns todos but
    // cannot tick off work on someone else's behalf — including their own.
    if (dto.status !== undefined && todo.assigneeId !== actor.id) {
      throw new ForbiddenException(
        'Only the admin a todo is assigned to can change its status',
      );
    }

    // Admins may only move their own todos along the status track.
    if (!isSuperAdmin(actor)) {
      const editsBeyondStatus =
        dto.title !== undefined ||
        dto.description !== undefined ||
        dto.dueDate !== undefined ||
        dto.position !== undefined;

      if (editsBeyondStatus) {
        throw new ForbiddenException(
          'You may only change the status of a todo assigned to you',
        );
      }

      if (todo.assigneeId !== actor.id) {
        throw new ForbiddenException('This todo is assigned to someone else');
      }
    }

    return this.prisma.todoItem.update({
      where: { id: todoId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.dueDate !== undefined && {
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        }),
        ...(dto.status !== undefined && {
          status: dto.status,
          completedAt: dto.status === TodoStatus.DONE ? new Date() : null,
        }),
      },
      include: todoInclude,
    });
  }

  async removeTodo(todoId: string, actor: AuthUser) {
    await this.getTodoForActor(todoId, actor);

    if (!isSuperAdmin(actor)) {
      throw new ForbiddenException('Only a super admin can delete a todo item');
    }

    await this.prisma.todoItem.delete({ where: { id: todoId } });
    return { message: 'Todo item deleted successfully', id: todoId };
  }

  /** Flat todo list across announcements — the admin's personal work queue. */
  async findTodos(query: QueryTodoDto, actor: AuthUser) {
    const {
      page = 1,
      limit = 10,
      search,
      order = 'desc',
      status,
      assigneeId,
      mine,
    } = query;

    if (assigneeId && !isSuperAdmin(actor)) {
      throw new ForbiddenException(
        "Only a super admin can browse another admin's todos",
      );
    }

    const where: Prisma.TodoItemWhereInput = {
      ...(status && { status }),
      ...(mine || !isSuperAdmin(actor)
        ? { assigneeId: actor.id }
        : assigneeId
          ? { assigneeId }
          : {}),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.todoItem.findMany({
        where,
        include: {
          ...todoInclude,
          announcement: { select: { id: true, title: true, status: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ dueDate: 'asc' }, { createdAt: order }],
      }),
      this.prisma.todoItem.count({ where }),
    ]);

    return { data, meta: buildMeta(total, page, limit) };
  }

  private resolveTargetBranch(actor: AuthUser, requested?: string) {
    if (isSuperAdmin(actor)) {
      // Undefined means "every branch".
      return requested ?? null;
    }

    const ownBranchId = requireOwnBranch(actor);

    if (requested && requested !== ownBranchId) {
      throw new ForbiddenException(
        'You can only post announcements for your own branch',
      );
    }

    return ownBranchId;
  }

  private visibilityFilter(
    actor: AuthUser,
    requestedBranchId?: string,
  ): Prisma.AnnouncementWhereInput {
    if (isSuperAdmin(actor)) {
      return requestedBranchId ? { branchId: requestedBranchId } : {};
    }

    return {
      OR: [{ branchId: null }, { branchId: requireOwnBranch(actor) }],
    };
  }

  private async getTodoForActor(todoId: string, actor: AuthUser) {
    const todo = await this.prisma.todoItem.findUnique({
      where: { id: todoId },
      select: { id: true, assigneeId: true, announcementId: true },
    });

    if (!todo) {
      throw new NotFoundException(`Todo item with id ${todoId} not found`);
    }

    // Reuses the announcement visibility rules.
    await this.findOne(todo.announcementId, actor);

    return todo;
  }

  private async assertAssignable(actor: AuthUser, assigneeId?: string) {
    if (!assigneeId) {
      return;
    }

    if (!isSuperAdmin(actor)) {
      throw new ForbiddenException(
        'Only a super admin can assign a todo to an admin',
      );
    }

    const assignee = await this.prisma.user.findUnique({
      where: { id: assigneeId },
      select: { id: true, role: true, isActive: true },
    });

    if (!assignee) {
      throw new NotFoundException(`User with id ${assigneeId} not found`);
    }

    if (assignee.role !== Role.ADMIN) {
      throw new BadRequestException(
        'Todos can only be assigned to branch admins',
      );
    }

    if (!assignee.isActive) {
      throw new BadRequestException('This admin account is deactivated');
    }
  }
}
