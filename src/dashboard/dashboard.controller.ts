import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { QueryCalendarDto } from './dto/query-calendar.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary:
      'Headline numbers for your branch — super admins see the whole network',
  })
  @ApiQuery({ name: 'branchId', required: false })
  summary(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.dashboardService.summary(user, branchId);
  }

  @Get('calendar')
  @ApiOperation({
    summary:
      'Month view: every activity date in the window, with its sessions and times',
  })
  calendar(@Query() query: QueryCalendarDto, @CurrentUser() user: AuthUser) {
    return this.dashboardService.calendar(query, user);
  }

  @Get('calendar/:date')
  @ApiOperation({
    summary: 'Day view: which activities run on this date and at what time',
  })
  @ApiQuery({ name: 'branchId', required: false })
  day(
    @Param('date') date: string,
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.dashboardService.day(date, user, branchId);
  }
}
