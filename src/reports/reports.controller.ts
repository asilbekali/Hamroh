import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { QueryReportDto } from './dto/query-report.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Reports')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('participants')
  @ApiOperation({
    summary:
      'Participants report for the last month / 3 months / year — Excel or JSON',
  })
  async participants(
    @Query() query: QueryReportDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (query.format === 'json') {
      return this.reportsService.participants(query, user);
    }

    const { buffer, filename } = await this.reportsService.participantsWorkbook(
      query,
      user,
    );

    return this.send(res, buffer, filename);
  }

  @Get('activities')
  @ApiOperation({
    summary:
      'Activities report for the last month / 3 months / year — Excel or JSON',
  })
  async activities(
    @Query() query: QueryReportDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (query.format === 'json') {
      return this.reportsService.activities(query, user);
    }

    const { buffer, filename } = await this.reportsService.activitiesWorkbook(
      query,
      user,
    );

    return this.send(res, buffer, filename);
  }

  @Get('visits')
  @ApiOperation({
    summary:
      'Visits report — one row per recorded attendance, so a person appears once per session they attended',
  })
  async visits(
    @Query() query: QueryReportDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (query.format === 'json') {
      return this.reportsService.visits(query, user);
    }

    const { buffer, filename } = await this.reportsService.visitsWorkbook(
      query,
      user,
    );

    return this.send(res, buffer, filename);
  }

  private send(res: Response, buffer: Buffer, filename: string) {
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
