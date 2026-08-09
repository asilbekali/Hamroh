import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AnnouncementsService } from './announcements.service';
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
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('Announcements')
@ApiBearerAuth()
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({
    summary: 'Create an announcement, optionally with a todo list',
  })
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: AuthUser) {
    return this.announcementsService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List announcements visible to you' })
  findAll(@Query() query: QueryAnnouncementDto, @CurrentUser() user: AuthUser) {
    return this.announcementsService.findAll(query, user);
  }

  @Get('todos')
  @ApiOperation({
    summary:
      'Flat todo list — admins see their own queue, super admins see everything',
  })
  findTodos(@Query() query: QueryTodoDto, @CurrentUser() user: AuthUser) {
    return this.announcementsService.findTodos(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an announcement with its todo list' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcementsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update an announcement' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcementsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Delete an announcement and its todos' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcementsService.remove(id, user);
  }

  @Post(':id/todos')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({
    summary: 'Add a todo item — a super admin may assign it to a branch admin',
  })
  addTodo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTodoItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcementsService.addTodo(id, dto, user);
  }

  @Patch('todos/:todoId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({
    summary:
      'Update a todo — assigned admins may change its status, super admins may change everything',
  })
  updateTodo(
    @Param('todoId', ParseUUIDPipe) todoId: string,
    @Body() dto: UpdateTodoItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcementsService.updateTodo(todoId, dto, user);
  }

  @Delete('todos/:todoId')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a todo item (super admin only)' })
  removeTodo(
    @Param('todoId', ParseUUIDPipe) todoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcementsService.removeTodo(todoId, user);
  }
}
