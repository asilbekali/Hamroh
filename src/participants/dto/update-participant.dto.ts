import { PartialType } from '@nestjs/swagger';
import { CreateParticipantDto } from './create-participant.dto';

/**
 * `branchId` stays updatable so a super admin can move someone between
 * branches; the service rejects the attempt for branch admins.
 */
export class UpdateParticipantDto extends PartialType(CreateParticipantDto) {}
