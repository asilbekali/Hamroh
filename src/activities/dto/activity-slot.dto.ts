import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

/**
 * One weekday of an activity's weekly schedule.
 *
 * Each weekday carries its own time, so an activity can run Monday and
 * Wednesday at 13:00 while Friday runs at 16:00.
 */
export class ActivitySlotDto {
  @ApiProperty({
    example: 5,
    minimum: 1,
    maximum: 7,
    description: 'ISO weekday: 1 = Monday … 7 = Sunday',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @ApiProperty({ example: '16:00', description: '24-hour HH:mm start time' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime must be 24-hour HH:mm, e.g. 16:00',
  })
  startTime: string;

  @ApiProperty({ example: 90, description: 'Length of this session in minutes' })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes: number;
}
