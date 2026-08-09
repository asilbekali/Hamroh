import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ActivitySlotDto } from './activity-slot.dto';

export class CreateActivityDto {
  @ApiProperty({ example: 'Ertalabki gimnastika' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    type: [ActivitySlotDto],
    description:
      'The weekly schedule, one entry per weekday. Each weekday has its own ' +
      'start time, so Mon/Wed can run at 13:00 while Fri runs at 16:00. ' +
      'A weekday may appear at most once.',
    example: [
      { weekday: 1, startTime: '13:00', durationMinutes: 60 },
      { weekday: 3, startTime: '13:00', durationMinutes: 60 },
      { weekday: 5, startTime: '16:00', durationMinutes: 90 },
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ActivitySlotDto)
  slots: ActivitySlotDto[];

  @ApiProperty({
    example: '2026-09-01',
    description: 'First day the schedule applies',
  })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description:
      'Last day the schedule applies. Omit for an open-ended activity.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Trainer running this activity. Must belong to the same branch.',
  })
  @IsOptional()
  @IsUUID()
  trainerId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required for super admins; admins always use their own branch.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
