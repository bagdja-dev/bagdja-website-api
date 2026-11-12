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
import { Website } from '../../entities/website.entity';
import { WebsiteTemplate } from '../../entities/website-template.entity';
import { WebsiteTemplateVersion } from '../../entities/website-template-version.entity';

import { TemplatePublicationClient } from './template-publication.client';
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
      WebsiteTemplate,
      WebsiteTemplateVersion,
      Website,
    ]),
    AuthModule,
    ChatServiceModule,
    NotificationsModule,
  ],
  controllers: [WebsitePlatformController, WebsitePlatformTemplateSubmissionController],
  providers: [WebsitePlatformService, WebsitePlatformTemplateSubmissionService, TemplatePublicationClient],
})
export class WebsitePlatformModule {}
