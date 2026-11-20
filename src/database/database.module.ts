import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BusinessProfileWaitlist } from '../entities/business-profile-waitlist.entity';
import { WebsiteProduct } from '../entities/website-product.entity';
import { WebsiteProductTranslation } from '../entities/website-product-translation.entity';
import { WebsiteLocation } from '../entities/website-location.entity';
import { WebsiteFaq } from '../entities/website-faq.entity';
import { WebsiteVendorLocation } from '../entities/website-vendor-location.entity';
import { WebsitePartner } from '../entities/website-partner.entity';
import { WebsitePartnerTranslation } from '../entities/website-partner-translation.entity';
import { WebsitePartnerCategory } from '../entities/website-partner-category.entity';
import { WebsitePartnerCategoryAssignment } from '../entities/website-partner-category-assignment.entity';
import { WebsitePartnerAccount } from '../entities/website-partner-account.entity';
import { WebsiteProductLocation } from '../entities/website-product-location.entity';
import { WebsiteChatThread } from '../entities/website-chat-thread.entity';
import { WebsiteBlogPost } from '../entities/website-blog-post.entity';
import { WebsiteBlogPostTranslation } from '../entities/website-blog-post-translation.entity';
import { WebsiteLanguage } from '../entities/website-language.entity';
import { WebsitePortfolioProject } from '../entities/website-portfolio-project.entity';
import { WebsitePortfolioProjectTranslation } from '../entities/website-portfolio-project-translation.entity';
import { GatheringOptionGroup } from '../entities/gathering-option-group.entity';
import { GatheringOption } from '../entities/gathering-option.entity';
import { GatheringOccurrence } from '../entities/gathering-occurrence.entity';
import { GatheringVote } from '../entities/gathering-vote.entity';
import { GatheringOccurrenceOptionSelection } from '../entities/gathering-occurrence-option-selection.entity';
import { StaffInvitation } from '../entities/staff-invitation.entity';
import { TenantStaff } from '../entities/tenant-staff.entity';
import { User } from '../entities/user.entity';
import { WebsiteEventGroup } from '../entities/website-event-group.entity';
import { WebsiteEventInvitation } from '../entities/website-event-invitation.entity';
import { WebsiteEventProductOption } from '../entities/website-event-product-option.entity';
import { WebsiteEventRegistration } from '../entities/website-event-registration.entity';
import { WebsiteEventRsvpChallenge } from '../entities/website-event-rsvp-challenge.entity';
import { WebsitePageTranslation } from '../entities/website-page-translation.entity';
import { WebsitePage } from '../entities/website-page.entity';
import { WebsitePlatformAccessRequest } from '../entities/website-platform-access-request.entity';
import { WebsitePlatformAuditLog } from '../entities/website-platform-audit-log.entity';
import { WebsitePlatformInvitation } from '../entities/website-platform-invitation.entity';
import { WebsitePlatformMember } from '../entities/website-platform-member.entity';
import { WebsitePlatformTemplateSubmission } from '../entities/website-platform-template-submission.entity';
import { WebsitePlatformTemplateTester } from '../entities/website-platform-template-tester.entity';
import { WebsiteSectionTranslation } from '../entities/website-section-translation.entity';
import { WebsiteSection } from '../entities/website-section.entity';
import { WebsiteTemplateVersion } from '../entities/website-template-version.entity';
import { WebsiteTemplate } from '../entities/website-template.entity';
import { Website } from '../entities/website.entity';

const entities = [
  User,
  Website,
  WebsitePage,
  WebsitePageTranslation,
  WebsiteSection,
  WebsiteSectionTranslation,
  WebsiteLanguage,
  WebsiteTemplate,
  WebsiteTemplateVersion,
  BusinessProfileWaitlist,
  TenantStaff,
  StaffInvitation,
  WebsiteProduct,
  WebsiteProductTranslation,
  WebsiteBlogPost,
  WebsiteBlogPostTranslation,
  WebsitePortfolioProject,
  WebsitePortfolioProjectTranslation,
  WebsiteLocation,
  WebsiteFaq,
  WebsiteVendorLocation,
  WebsitePartner,
  WebsitePartnerTranslation,
  WebsitePartnerCategory,
  WebsitePartnerCategoryAssignment,
  WebsitePartnerAccount,
  WebsiteProductLocation,
  WebsiteChatThread,
  GatheringOptionGroup,
  GatheringOption,
  GatheringOccurrence,
  GatheringVote,
  GatheringOccurrenceOptionSelection,
  WebsiteEventProductOption,
  WebsiteEventGroup,
  WebsiteEventInvitation,
  WebsiteEventRegistration,
  WebsiteEventRsvpChallenge,
  WebsitePlatformMember,
  WebsitePlatformInvitation,
  WebsitePlatformAccessRequest,
  WebsitePlatformAuditLog,
  WebsitePlatformTemplateSubmission,
  WebsitePlatformTemplateTester,
];

@Global()
@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
