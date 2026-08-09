import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('activities/:activityId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.TRAINER)
  @ApiOperation({
    summary:
      'Attach the people who turned up to one dated session of an activity',
  })
  mark(
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: MarkAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attendanceService.mark(activityId, dto, user);
  }

  @Get('activities/:activityId')
  @ApiOperation({ summary: 'Attendance sheet for one activity on one date' })
  @ApiQuery({ name: 'date', required: true, example: '2026-09-15' })
  sessionSheet(
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Query('date') date: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attendanceService.sessionSheet(activityId, date, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Search attendance records within your branch scope',
  })
  findAll(@Query() query: QueryAttendanceDto, @CurrentUser() user: AuthUser) {
    return this.attendanceService.findAll(query, user);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.TRAINER)
  @ApiOperation({ summary: 'Remove a single attendance record' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attendanceService.remove(id, user);
  }
}
