import { ApiPropertyOptional } from '@nestjs/swagger';
import { Region } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export const PARTICIPANT_SORT_FIELDS = [
  'serialNumber',
  'lastName',
  'firstName',
  'birthDate',
  'createdAt',
] as const;

export type ParticipantSortField = (typeof PARTICIPANT_SORT_FIELDS)[number];

export class QueryParticipantDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: PARTICIPANT_SORT_FIELDS,
    default: 'createdAt',
    description: 'Column the list is ordered by',
  })
  @IsOptional()
  @IsIn(PARTICIPANT_SORT_FIELDS)
  sortBy?: ParticipantSortField = 'createdAt';

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Super admins only — narrow the list to one branch',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    enum: Region,
    description: 'Super admins only — every branch of a region',
  })
  @IsOptional()
  @IsEnum(Region)
  region?: Region;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only people who ever attended this activity',
  })
  @IsOptional()
  @IsUUID()
  activityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}
