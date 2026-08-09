import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsUUID,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    example: 'admin_samarqand',
    description:
      'Login name. Lowercase letters, digits, dot, dash, underscore.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[a-z0-9._-]+$/, {
    message:
      'username may only contain lowercase letters, digits, dot, dash and underscore',
  })
  username: string;

  @ApiProperty({ example: 'Strong123!', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Aliyev Asilbek Baxtiyorovich' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({
    enum: Role,
    default: Role.ADMIN,
    description:
      'Super admins may create ADMIN or TRAINER accounts; admins may only create TRAINER accounts.',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required when a super admin creates the account. Admins always get their own branch.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
