import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateParticipantDto {
  @ApiProperty({ example: 'Dilnoza', description: 'Ism' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName: string;

  @ApiProperty({ example: 'Karimova', description: 'Familiya' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName: string;

  @ApiPropertyOptional({ example: 'Baxtiyorovna', description: 'Sharifi' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  middleName?: string;

  @ApiProperty({
    example: '2000-05-14',
    description: 'Tugʻilgan sana — toʻliq kun/oy/yil (YYYY-MM-DD)',
  })
  @IsDateString()
  birthDate: string;

  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @MinLength(7)
  @MaxLength(30)
  phone: string;

  @ApiProperty({ example: 'Samarqand sh., Registon koʻchasi 12' })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  address: string;

  @ApiPropertyOptional({
    example: 'Yakkasaroy',
    description: 'District ("tuman") — its own column in the Excel report',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @ApiPropertyOptional({
    example: 'Shoxjahon',
    description: 'Neighbourhood ("mahalla") — its own column in the report',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mahalla?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required for super admins. Admins always get their own branch automatically.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
