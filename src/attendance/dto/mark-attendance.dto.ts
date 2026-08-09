import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class AttendanceEntryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  participantId: string;

  @ApiPropertyOptional({
    enum: AttendanceStatus,
    default: AttendanceStatus.PRESENT,
  })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class MarkAttendanceDto {
  @ApiProperty({
    example: '2026-09-15',
    description:
      'The day the session took place. Must fall on a scheduled weekday.',
  })
  @IsDateString()
  date: string;

  @ApiProperty({
    type: [AttendanceEntryDto],
    description: 'The people who showed up. Re-sending a person updates them.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries: AttendanceEntryDto[];
}
