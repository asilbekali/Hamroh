import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class QueryCalendarDto {
  @ApiPropertyOptional({
    example: '2026-09-01',
    description:
      'First day of the window. Defaults to the start of this month.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-30',
    description: 'Last day of the window. Defaults to the end of this month.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Super admins only — show a single branch',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only the sessions this trainer runs',
  })
  @IsOptional()
  @IsUUID()
  trainerId?: string;
}
