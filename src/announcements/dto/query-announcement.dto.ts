import { ApiPropertyOptional } from '@nestjs/swagger';
import { AnnouncementStatus, TodoStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryAnnouncementDto extends PaginationDto {
  @ApiPropertyOptional({ enum: AnnouncementStatus })
  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Super admins only — narrow to one branch',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class QueryTodoDto extends PaginationDto {
  @ApiPropertyOptional({ enum: TodoStatus })
  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Super admins only — todos assigned to one admin',
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Only the todos assigned to me' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mine?: boolean;
}
