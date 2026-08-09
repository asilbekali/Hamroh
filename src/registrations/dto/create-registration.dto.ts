import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus, RegistrationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRegistrationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  participantId: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required unless activityId is provided',
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required unless eventId is provided',
  })
  @IsOptional()
  @IsUUID()
  activityId?: string;

  @ApiPropertyOptional({
    enum: RegistrationStatus,
    default: RegistrationStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(RegistrationStatus)
  status?: RegistrationStatus;

  @ApiPropertyOptional({
    enum: AttendanceStatus,
    default: AttendanceStatus.NOT_MARKED,
  })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  attendance?: AttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
