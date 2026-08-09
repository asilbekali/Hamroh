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
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { QueryBranchDto } from './dto/query-branch.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('Branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a branch (super admin only)' })
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List branches — super admins see all, staff see only their own',
  })
  findAll(@Query() query: QueryBranchDto, @CurrentUser() user: AuthUser) {
    return this.branchesService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a branch with its staff' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.branchesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a branch (super admin only)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(id, dto);
  }

  @Post(':id/staff')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Attach admins/trainers to a branch — they immediately gain control of that branch',
  })
  assignStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignStaffDto,
  ) {
    return this.branchesService.assignStaff(id, dto);
  }

  @Delete(':id/staff/:userId')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Detach a staff account from a branch' })
  removeStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.branchesService.removeStaff(id, userId);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete an empty branch (super admin only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.branchesService.remove(id);
  }
}
