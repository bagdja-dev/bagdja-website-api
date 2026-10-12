import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GatheringOptionGroup } from '../../entities/gathering-option-group.entity';
import { GatheringOption } from '../../entities/gathering-option.entity';
import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';
import { GatheringVote } from '../../entities/gathering-vote.entity';
import { GatheringOccurrenceOptionSelection } from '../../entities/gathering-occurrence-option-selection.entity';
import { GatheringOptionGroupService } from './gathering-option-group.service';
import { GatheringOptionService } from './gathering-option.service';
import { GatheringOccurrenceService } from './gathering-occurrence.service';
import { GatheringVoteService } from './gathering-vote.service';
import { GatheringOccurrenceOptionSelectionService } from './gathering-occurrence-option-selection.service';
import { GatheringValidationService } from './gathering-validation.service';
import { WebsiteEventGroup } from '../../entities/website-event-group.entity';
import { WebsiteEventProductOption, WebsiteProduct } from '../../entities';
import { AuthModule } from '../../common/auth';
import { GatheringController } from './gathering.controller';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      GatheringOptionGroup,
      GatheringOption,
      GatheringOccurrence,
      GatheringVote,
      GatheringOccurrenceOptionSelection,
      WebsiteEventGroup,
      WebsiteEventProductOption,
      WebsiteProduct,
    ]),
  ],
  controllers: [GatheringController],
  providers: [
    GatheringOptionGroupService,
    GatheringOptionService,
    GatheringOccurrenceService,
    GatheringVoteService,
    GatheringOccurrenceOptionSelectionService,
    GatheringValidationService,
  ],
  exports: [
    GatheringOptionGroupService,
    GatheringOptionService,
    GatheringOccurrenceService,
    GatheringVoteService,
    GatheringOccurrenceOptionSelectionService,
    GatheringValidationService,
  ],
})
export class GatheringModule {}
