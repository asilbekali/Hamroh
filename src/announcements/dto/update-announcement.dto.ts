import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateAnnouncementDto } from './create-announcement.dto';

/** Todo items are managed through the dedicated `/announcements/:id/todos` routes. */
export class UpdateAnnouncementDto extends PartialType(
  OmitType(CreateAnnouncementDto, ['todos'] as const),
) {}
