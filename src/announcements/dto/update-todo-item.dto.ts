import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { TodoStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { CreateTodoItemDto } from './create-announcement.dto';

export class UpdateTodoItemDto extends PartialType(CreateTodoItemDto) {
  @ApiPropertyOptional({ enum: TodoStatus })
  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @ApiPropertyOptional({ description: 'Sort position inside the checklist' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}
