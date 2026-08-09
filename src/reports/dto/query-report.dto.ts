import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { ReportPeriod } from '../../common/utils/date.util';

export const REPORT_PERIODS = ['month', 'quarter', 'year'] as const;

export class QueryReportDto {
  @ApiPropertyOptional({
    enum: REPORT_PERIODS,
    default: 'month',
    description:
      'month = last 1 month, quarter = last 3 months, year = last 12 months',
  })
  @IsOptional()
  @IsIn(REPORT_PERIODS)
  period?: ReportPeriod = 'month';

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Super admins only — limit the report to one branch',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    enum: ['xlsx', 'json'],
    default: 'xlsx',
    description: 'Use json to preview the same numbers without downloading',
  })
  @IsOptional()
  @IsIn(['xlsx', 'json'])
  format?: 'xlsx' | 'json' = 'xlsx';
}
