import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateActivityDto } from './create-activity.dto';

/** An activity never moves between branches — recreate it instead. */
export class UpdateActivityDto extends PartialType(
  OmitType(CreateActivityDto, ['branchId'] as const),
) {}
