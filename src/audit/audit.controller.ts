import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

/**
 * Read-only by design: the trail exists to be trusted, so nothing here can
 * edit or remove an entry. Clearing it means going into the database by hand.
 */
@ApiTags('Audit log')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Who changed what, from which branch — super admin only',
  })
  findAll(@Query() query: QueryAuditDto, @CurrentUser() user: AuthUser) {
    return this.auditService.findAll(query, user);
  }

  @Get('filters')
  @ApiOperation({ summary: 'Actors and actions present in the log' })
  filters() {
    return this.auditService.filters();
  }
}
