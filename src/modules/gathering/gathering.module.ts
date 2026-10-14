import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
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
import { WebsiteEventInvitation } from '../../entities/website-event-invitation.entity';
import { PublicGatheringInvitationController } from './public-gathering-invitation.controller';
import { WebsiteEventRegistration } from '../../entities/website-event-registration.entity';
import { EscrowModule } from '../escrow/escrow.module';
import { WebsiteEventRsvpChallenge } from '../../entities/website-event-rsvp-challenge.entity';
import { GatheringPublicInvoiceController } from './public-gathering-invoice.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { GatheringOperation } from '../../entities/gathering-operation.entity';
import { GATHERING_OPERATIONS_QUEUE } from './gathering-operations.constants';
import { GatheringOperationsProcessor } from './gathering-operations.processor';
import { GatheringOperationsController } from './gathering-operations.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    AuthModule,
    EscrowModule,
    TransactionsModule,
    StorageModule,
    BullModule.registerQueue({ name: GATHERING_OPERATIONS_QUEUE }),
    TypeOrmModule.forFeature([
      GatheringOptionGroup,
      GatheringOption,
      GatheringOccurrence,
      GatheringVote,
      GatheringOccurrenceOptionSelection,
      WebsiteEventGroup,
      WebsiteEventProductOption,
      WebsiteProduct,
      WebsiteEventInvitation,
      WebsiteEventRegistration,
      WebsiteEventRsvpChallenge,
      GatheringOperation,
    ]),
  ],
  controllers: [GatheringController, PublicGatheringInvitationController, GatheringPublicInvoiceController, GatheringOperationsController],
  providers: [
    GatheringOptionGroupService,
    GatheringOptionService,
    GatheringOccurrenceService,
    GatheringVoteService,
    GatheringOccurrenceOptionSelectionService,
    GatheringValidationService,
    GatheringOperationsProcessor,
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
