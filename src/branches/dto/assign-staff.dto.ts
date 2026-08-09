import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class AssignStaffDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Admin or trainer accounts to attach to this branch',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  userIds: string[];
}
