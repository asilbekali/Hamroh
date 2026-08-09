import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Username, or the phone number for the default super admin',
    example: '+998900000000',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  username: string;

  @ApiProperty({ example: 'Admin123!', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}
