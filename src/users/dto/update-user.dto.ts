import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

/**
 * Username is immutable, and branch membership is changed through
 * `POST /branches/:id/staff` so the reassignment stays in one place.
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['username', 'branchId'] as const),
) {}
