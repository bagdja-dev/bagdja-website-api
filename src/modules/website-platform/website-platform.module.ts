import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../common/auth';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatServiceModule } from '../../common/chat-service/chat-service.module';
import { WebsitePlatformAccessRequest } from '../../entities/website-platform-access-request.entity';
import { WebsitePlatformAuditLog } from '../../entities/website-platform-audit-log.entity';
import { WebsitePlatformInvitation } from '../../entities/website-platform-invitation.entity';
import { WebsitePlatformMember } from '../../entities/website-platform-member.entity';
import { WebsitePlatformTemplateSubmission } from '../../entities/website-platform-template-submission.entity';
import { WebsitePlatformTemplateTester } from '../../entities/website-platform-template-tester.entity';
import { TenantStaff } from '../../entities/tenant-staff.entity';
import { Website } from '../../entities/website.entity';
import { WebsiteTemplate } from '../../entities/website-template.entity';
import { WebsiteTemplateVersion } from '../../entities/website-template-version.entity';

import { TemplatePublicationClient } from './template-publication.client';
import {
  PublicTemplateTrialController,
  TemplateCandidatesController,
  TemplateVersionOptionsController,
  WebsiteTemplateTrialController,
} from './template-trial.controller';
import { TemplateTrialService } from './template-trial.service';
import { WebsitePlatformTemplateSubmissionController } from './website-platform-template-submission.controller';
import { WebsitePlatformTemplateSubmissionService } from './website-platform-template-submission.service';
import { WebsitePlatformController } from './website-platform.controller';
import { WebsitePlatformService } from './website-platform.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebsitePlatformMember,
      WebsitePlatformInvitation,
      WebsitePlatformAccessRequest,
      WebsitePlatformAuditLog,
      WebsitePlatformTemplateSubmission,
      WebsitePlatformTemplateTester,
      WebsiteTemplate,
      WebsiteTemplateVersion,
      Website,
      TenantStaff,
    ]),
    AuthModule,
    ChatServiceModule,
    NotificationsModule,
  ],
  controllers: [
    WebsitePlatformController,
    WebsitePlatformTemplateSubmissionController,
    TemplateCandidatesController,
    TemplateVersionOptionsController,
    WebsiteTemplateTrialController,
    PublicTemplateTrialController,
  ],
  providers: [
    WebsitePlatformService,
    WebsitePlatformTemplateSubmissionService,
    TemplatePublicationClient,
    TemplateTrialService,
  ],
})
export class WebsitePlatformModule {}
