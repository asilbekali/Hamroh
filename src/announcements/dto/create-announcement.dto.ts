import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AnnouncementStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateTodoItemDto {
  @ApiProperty({ example: 'Ishtirokchilar roʻyxatini yangilash' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Branch admin responsible for this item (super admin assigns it)',
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ example: '2026-09-20T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'Registration is now open' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Registration for the Youth Summit is now open.' })
  @IsString()
  @MinLength(3)
  body: string;

  @ApiPropertyOptional({
    enum: AnnouncementStatus,
    default: AnnouncementStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Target branch. Super admins may leave it empty to address every branch.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    type: [CreateTodoItemDto],
    description: 'Checklist created together with the announcement',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTodoItemDto)
  todos?: CreateTodoItemDto[];
}
