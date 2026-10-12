import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../entities/user.entity';
import { Website } from '../entities/website.entity';
import { WebsitePage } from '../entities/website-page.entity';
import { WebsiteSection } from '../entities/website-section.entity';
import { WebsiteTemplate } from '../entities/website-template.entity';
import { TenantStaff } from '../entities/tenant-staff.entity';
import { StaffInvitation } from '../entities/staff-invitation.entity';
import { WebsiteProduct } from '../entities/website-product.entity';
import { WebsiteLocation } from '../entities/website-location.entity';
import { WebsiteFaq } from '../entities/website-faq.entity';
import { WebsiteVendor } from '../entities/website-vendor.entity';
import { WebsiteVendorLocation } from '../entities/website-vendor-location.entity';
import { WebsiteProductLocation } from '../entities/website-product-location.entity';
import { WebsiteChatThread } from '../entities/website-chat-thread.entity';
import { GatheringOptionGroup } from '../entities/gathering-option-group.entity';
import { GatheringOption } from '../entities/gathering-option.entity';
import { GatheringOccurrence } from '../entities/gathering-occurrence.entity';
import { GatheringVote } from '../entities/gathering-vote.entity';
import { GatheringOccurrenceOptionSelection } from '../entities/gathering-occurrence-option-selection.entity';
import { WebsiteEventProductOption } from '../entities/website-event-product-option.entity';
import { WebsiteEventGroup } from '../entities/website-event-group.entity';

const entities = [
  User,
  Website,
  WebsitePage,
  WebsiteSection,
  WebsiteTemplate,
  TenantStaff,
  StaffInvitation,
  WebsiteProduct,
  WebsiteLocation,
  WebsiteFaq,
  WebsiteVendor,
  WebsiteVendorLocation,
  WebsiteProductLocation,
  WebsiteChatThread,
  GatheringOptionGroup,
  GatheringOption,
  GatheringOccurrence,
  GatheringVote,
  GatheringOccurrenceOptionSelection,
  WebsiteEventProductOption,
  WebsiteEventGroup,
];

@Global()
@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
