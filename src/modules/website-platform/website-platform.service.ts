import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, MoreThan, Not, Repository } from 'typeorm';

import type { AuthUser } from '../../common/auth/auth-user';
import { ChatServiceClient } from '../../common/chat-service/chat-service.client';
import { WebsitePlatformAccessRequest } from '../../entities/website-platform-access-request.entity';
import { WebsitePlatformAuditLog } from '../../entities/website-platform-audit-log.entity';
import { WebsitePlatformInvitation } from '../../entities/website-platform-invitation.entity';
import { WebsitePlatformMember } from '../../entities/website-platform-member.entity';
import { MessagingService } from '../messaging/messaging.service';

import { canTransitionAccessRequest } from './access-request-workflow.util';
import type { CreateAccessRequestDto } from './dto/create-access-request.dto';
import type { CreatePlatformInvitationDto } from './dto/create-platform-invitation.dto';
import type { ReviewAccessRequestDto } from './dto/review-access-request.dto';
import type { SendAccessRequestDiscussionMessageDto } from './dto/send-access-request-discussion-message.dto';
import {
  createInvitationToken,
  hashInvitationToken,
  isOrganizationOwnerOrAdmin,
  normalizePlatformEmail,
} from './website-platform-access.util';

interface PublicClientApp {
  appId: string;
  organizationId: string;
  organizationName?: string;
}

const OPEN_ACCESS_REQUEST_STATUSES = ['pending', 'curating', 'invited', 'discussion'] as const;

@Injectable()
export class WebsitePlatformService {
  private readonly logger = new Logger(WebsitePlatformService.name);
  private readonly authServiceUrl: string;
  private readonly clientAppId: string;
  private readonly clientAppSecret: string;
  private readonly platformClientId: string;
  private readonly platformAppUrl: string;
  private authClientToken: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly messaging: MessagingService,
    @InjectRepository(WebsitePlatformMember)
    private readonly members: Repository<WebsitePlatformMember>,
    @InjectRepository(WebsitePlatformInvitation)
    private readonly invitations: Repository<WebsitePlatformInvitation>,
    @InjectRepository(WebsitePlatformAccessRequest)
    private readonly requests: Repository<WebsitePlatformAccessRequest>,
    @InjectRepository(WebsitePlatformAuditLog)
    private readonly auditLogs: Repository<WebsitePlatformAuditLog>,
    private readonly chat: ChatServiceClient,
  ) {
    this.authServiceUrl = (
      config.get<string>('BAGDJA_AUTH_API') ??
      config.get<string>('BAGDJA_AUTH_URL') ??
      'http://localhost:4001'
    ).replace(/\/$/, '');
    this.clientAppId = config.get<string>('CLIENT_APP_ID') ?? '';
    this.clientAppSecret = config.get<string>('CLIENT_APP_SECRET') ?? '';
    this.platformClientId = config.get<string>('WEBSITE_PLATFORM_OAUTH_CLIENT_ID') ?? '';
    this.platformAppUrl = (
      config.get<string>('WEBSITE_PLATFORM_APP_URL') ??
      config.get<string>('BAGDJA_APP_URL') ??
      'http://localhost:5006'
    ).replace(/\/$/, '');
  }

  async getInvitationRegistrationStatus(token: string) {
    const invitation = await this.invitations.findOne({
      where: { token_hash: hashInvitationToken(token) },
    });
    if (
      !invitation ||
      invitation.revoked_at ||
      invitation.accepted_at ||
      invitation.expires_at <= new Date()
    ) {
      throw new NotFoundException('Invitation is invalid or unavailable');
    }

    const authToken = await this.getAuthClientToken();
    let response: Response;
    try {
      response = await fetch(
        `${this.authServiceUrl}/auth/users/by-username/${encodeURIComponent(invitation.email)}`,
        {
          headers: { 'x-api-token': authToken },
          cache: 'no-store',
        },
      );
    } catch (error) {
      this.logger.error(
        'Bagdja Auth account lookup failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('Could not verify the invitation account status');
    }

    if (response.status === 404) {
      return { registered: false, email: invitation.email };
    }
    if (!response.ok) {
      this.logger.error(`Bagdja Auth account lookup returned ${response.status}`);
      throw new ServiceUnavailableException('Could not verify the invitation account status');
    }

    let user: unknown;
    try {
      user = await response.json();
    } catch (error) {
      this.logger.error(
        'Bagdja Auth account lookup returned invalid JSON',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('Could not verify the invitation account status');
    }
    if (
      !user ||
      typeof user !== 'object' ||
      !('emailVerified' in user) ||
      typeof user.emailVerified !== 'boolean'
    ) {
      this.logger.error('Bagdja Auth account lookup returned an invalid response');
      throw new ServiceUnavailableException('Could not verify the invitation account status');
    }

    return {
      registered: user.emailVerified === true,
      email: invitation.email,
    };
  }

  private async getAuthClientToken(): Promise<string> {
    const now = Date.now();
    if (this.authClientToken && this.authClientToken.expiresAt > now + 60_000) {
      return this.authClientToken.token;
    }
    if (!this.clientAppId || !this.clientAppSecret) {
      throw new ServiceUnavailableException('CLIENT_APP_ID or CLIENT_APP_SECRET is not configured');
    }

    let response: Response;
    try {
      response = await fetch(`${this.authServiceUrl}/auth/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: this.clientAppId,
          app_secret: this.clientAppSecret,
        }),
        cache: 'no-store',
      });
    } catch (error) {
      this.logger.error(
        'Could not obtain a Bagdja Auth client token',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('Could not verify the invitation account status');
    }
    if (!response.ok) {
      this.logger.error(`Bagdja Auth client token request returned ${response.status}`);
      throw new ServiceUnavailableException('Could not verify the invitation account status');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      this.logger.error(
        'Bagdja Auth client token response was invalid JSON',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('Could not verify the invitation account status');
    }
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('x-api-token' in payload) ||
      typeof payload['x-api-token'] !== 'string' ||
      !payload['x-api-token']
    ) {
      this.logger.error('Bagdja Auth returned an invalid client token response');
      throw new ServiceUnavailableException('Could not verify the invitation account status');
    }
    const expiresIn =
      'expires_in' in payload && typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
    this.authClientToken = {
      token: payload['x-api-token'],
      expiresAt: now + expiresIn * 1000,
    };
    return this.authClientToken.token;
  }

  async getAccess(user: AuthUser, authorization: string) {
    const app = await this.getPlatformClientApp();
    const organizations = await this.getUserOrganizations(authorization);
    const account = {
      displayName:
        user.displayName?.trim() ||
        user.username?.trim() ||
        user.email?.trim() ||
        'Akun Bagdja',
      email: user.email ?? null,
      profilePicture: user.profilePicture ?? null,
    };
    if (isOrganizationOwnerOrAdmin(organizations, app.organizationId)) {
      return {
        allowed: true,
        role: 'super_admin' as const,
        organizationName: app.organizationName ?? app.organizationId,
        account,
      };
    }

    const member = await this.members.findOne({
      where: { user_id: user.userId, is_active: true },
    });
    if (member) {
      return {
        allowed: true,
        role: member.role,
        organizationName: app.organizationName ?? app.organizationId,
        account,
      };
    }

    const discussionRequest = await this.requests.findOne({
      where: {
        applicant_user_id: user.userId,
        status: In(['invited', 'discussion']),
      },
    });
    const applicantHasActiveRequest =
      discussionRequest?.status === 'invited' ||
      (discussionRequest?.status === 'discussion' &&
        Boolean(discussionRequest.discussion_topic_id));
    return {
      allowed: applicantHasActiveRequest,
      role: applicantHasActiveRequest ? 'applicant' : null,
      organizationName: app.organizationName ?? app.organizationId,
      account,
    };
  }

  async createAccessRequest(user: AuthUser, dto: CreateAccessRequestDto) {
    if (!user.email) {
      throw new ForbiddenException(
        'A Bagdja account with an email address is required to request access',
      );
    }
    const email = normalizePlatformEmail(user.email);
    const existing = await this.requests.findOne({
      where: { email, status: In([...OPEN_ACCESS_REQUEST_STATUSES]) },
    });
    if (existing) {
      throw new ConflictException('A pending access request already exists for this email');
    }
    const recentSubmissions = await this.requests.count({
      where: {
        email,
        created_at: MoreThan(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      },
    });
    if (recentSubmissions >= 3) {
      throw new HttpException(
        'Too many access requests for this email. Try again tomorrow.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const requestRepo = manager.getRepository(WebsitePlatformAccessRequest);
      const request = await requestRepo.save(
        requestRepo.create({
          email,
          applicant_user_id: user.userId,
          name: dto.name.trim(),
          portfolio_url: dto.portfolioUrl?.trim() || null,
          message: dto.message?.trim() || null,
          status: 'pending',
        }),
      );
      await this.writeAudit(
        user.userId,
        'access_request.created',
        'access_request',
        request.id,
        { email },
        manager,
      );
      return {
        id: request.id,
        email: request.email,
        status: request.status,
        createdAt: request.created_at,
      };
    });
    const emailSent = await this.sendAccessRequestEmail(
      this.messaging.websitePlatformAccessRequestReceivedTemplate,
      created.email,
      {
        'applicant-name': dto.name.trim(),
        'application-link': new URL('/apply', this.platformAppUrl).toString(),
      },
      `request receipt email for ${created.id}`,
    );
    return { ...created, emailSent };
  }

  async getMyAccessRequest(user: AuthUser) {
    if (!user.email) {
      throw new ForbiddenException(
        'A Bagdja account with an email address is required to request access',
      );
    }

    const request = await this.requests.findOne({
      where: [
        {
          applicant_user_id: user.userId,
        },
        {
          email: normalizePlatformEmail(user.email),
        },
      ],
      order: { created_at: 'DESC' },
    });

    if (!request) {
      return null;
    }

    return {
      id: request.id,
      email: request.email,
      status: request.status,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
      decisionNote: request.status === 'rejected' ? request.review_note : null,
    };
  }

  private async createAccessRequestDiscussion(
    request: WebsitePlatformAccessRequest,
    reviewerUserId: string,
  ): Promise<string> {
    if (!request.applicant_user_id) {
      throw new BadRequestException(
        'The applicant must have a Bagdja account before a discussion can be opened',
      );
    }
    const topic = await this.chat.createDirectTopic({
      dmKey: `website-platform-access-request:${request.id}`,
      participantUserIds: [request.applicant_user_id, reviewerUserId],
      name: `Diskusi permohonan designer: ${request.name}`,
      createdByUserId: reviewerUserId,
      appClientType: 'web',
      appClientTypeName: 'Bagdja Website Platform',
      contextMetadata: [
        {
          type: 'website_platform_access_request',
          name: 'Permohonan akses designer',
          data: { accessRequestId: request.id },
        },
      ],
    });
    return topic.id;
  }

  private discussionLink(): string {
    const loginUrl = new URL('/auth/login', this.platformAppUrl);
    loginUrl.searchParams.set('next', '/discussion');
    return loginUrl.toString();
  }

  private async sendAccessRequestEmail(
    template: string,
    email: string,
    context: Record<string, string>,
    description: string,
  ): Promise<boolean> {
    const sent = await this.messaging.sendEmail({ to: email, template, context });
    if (!sent) {
      this.logger.warn(`Could not send Website Platform ${description} to ${email}`);
    }
    return sent;
  }

  private async getApplicantDiscussionRequest(user: AuthUser) {
    const request = await this.requests.findOne({
      where: {
        applicant_user_id: user.userId,
        status: In(['invited', 'discussion']),
      },
      order: { created_at: 'DESC' },
    });
    if (!request || (request.status === 'discussion' && !request.discussion_topic_id)) {
      throw new NotFoundException('No active designer application discussion');
    }
    return request;
  }

  private async getAdminDiscussionRequest(
    user: AuthUser,
    authorization: string,
    requestId: string,
  ) {
    await this.requireSuperAdmin(user, authorization);
    const request = await this.requests.findOne({
      where: {
        id: requestId,
        discussion_topic_id: Not(IsNull()),
      },
    });
    if (!request || !request.discussion_topic_id) {
      throw new NotFoundException('No discussion is available for this request');
    }
    await this.chat.addDirectParticipant(
      request.discussion_topic_id,
      user.userId,
      user.email ?? null,
    );
    return request;
  }

  private async readDiscussion(request: WebsitePlatformAccessRequest, userId: string) {
    if (request.status === 'invited') {
      return {
        requestId: request.id,
        status: request.status,
        topicId: null,
        viewerUserId: userId,
        applicantName: request.name,
        applicantEmail: request.email,
        messages: [],
      };
    }
    const topicId = request.discussion_topic_id;
    if (!topicId) {
      throw new NotFoundException('No active discussion for this request');
    }
    const messages = await this.chat.listMessages(topicId, 100, 0, userId);
    await this.chat.markTopicRead(topicId, userId);
    return {
      requestId: request.id,
      status: request.status,
      topicId,
      viewerUserId: userId,
      applicantName: request.name,
      applicantEmail: request.email,
      messages: messages.items,
    };
  }

  async getMyDiscussion(user: AuthUser) {
    const request = await this.getApplicantDiscussionRequest(user);
    return this.readDiscussion(request, user.userId);
  }

  async getAccessRequestDiscussion(
    user: AuthUser,
    authorization: string,
    requestId: string,
  ) {
    const access = await this.getAccess(user, authorization);
    if (!access.allowed) {
      throw new ForbiddenException('An active Website Platform role is required');
    }
    const request = await this.requests.findOne({
      where: {
        id: requestId,
        discussion_topic_id: Not(IsNull()),
      },
    });
    if (!request || !request.discussion_topic_id) {
      throw new NotFoundException('No discussion is available for this request');
    }
    if (
      access.role !== 'super_admin' &&
      (access.role !== 'designer' || request.applicant_user_id !== user.userId)
    ) {
      throw new ForbiddenException('You cannot view this discussion');
    }
    if (access.role === 'super_admin') {
      await this.chat.addDirectParticipant(
        request.discussion_topic_id,
        user.userId,
        user.email ?? null,
      );
    }
    return this.readDiscussion(request, user.userId);
  }

  async listAccessRequestDiscussions(user: AuthUser, authorization: string) {
    const access = await this.getAccess(user, authorization);
    if (
      !access.allowed ||
      (access.role !== 'super_admin' && access.role !== 'designer')
    ) {
      throw new ForbiddenException('An active Website Platform role is required');
    }
    const requests = await this.requests.find({
      where:
        access.role === 'super_admin'
          ? { discussion_topic_id: Not(IsNull()) }
          : {
              applicant_user_id: user.userId,
              discussion_topic_id: Not(IsNull()),
            },
      order: { updated_at: 'DESC', created_at: 'DESC' },
    });
    return requests.map((request) => ({
      id: request.id,
      name: request.name,
      email: request.email,
      status: request.status,
      topicId: request.discussion_topic_id,
      assignedToName: request.assigned_to_name,
      updatedAt: request.updated_at,
      createdAt: request.created_at,
    }));
  }

  private async createDiscussionMessage(
    request: WebsitePlatformAccessRequest,
    sender: AuthUser,
    dto: SendAccessRequestDiscussionMessageDto,
    applicantIsSender: boolean,
  ) {
    const topicId = request.discussion_topic_id;
    if (!topicId) {
      throw new NotFoundException('No active discussion for this request');
    }
    const message = await this.chat.createMessage(topicId, {
      senderUserId: sender.userId,
      senderDisplayName: sender.username ?? sender.email ?? 'Bagdja user',
      body: dto.body,
    });
    let activityUpdated = false;
    try {
      const updateResult = await this.requests.update(request.id, {
        updated_at: new Date(message.createdAt),
      });
      activityUpdated = (updateResult.affected ?? 0) > 0;
      if (!activityUpdated) {
        this.logger.warn(
          `Could not update inbox activity for access request ${request.id}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Could not update inbox activity for access request ${request.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
    const recipientEmail = applicantIsSender
      ? this.config.get<string>('WEBSITE_PLATFORM_REVIEW_EMAIL')
      : request.email;
    const emailSent = recipientEmail
      ? await this.sendAccessRequestEmail(
          this.messaging.websitePlatformDiscussionMessageTemplate,
          recipientEmail,
          {
            'applicant-name': applicantIsSender ? 'Tim Kurasi Bagdja' : request.name,
            'sender-name': sender.username ?? sender.email ?? 'Tim Bagdja',
            'discussion-link': this.discussionLink(),
          },
          `discussion notification for ${request.id}`,
        )
      : false;
    if (applicantIsSender && !recipientEmail) {
      this.logger.warn(
        'WEBSITE_PLATFORM_REVIEW_EMAIL is not configured; discussion message email notification was not sent',
      );
    }
    return { message, emailSent, activityUpdated };
  }

  async sendMyDiscussionMessage(user: AuthUser, dto: SendAccessRequestDiscussionMessageDto) {
    const request = await this.getApplicantDiscussionRequest(user);
    return this.createDiscussionMessage(request, user, dto, true);
  }

  async sendAccessRequestDiscussionMessage(
    user: AuthUser,
    authorization: string,
    requestId: string,
    dto: SendAccessRequestDiscussionMessageDto,
  ) {
    const request = await this.getAdminDiscussionRequest(user, authorization, requestId);
    if (request.status !== 'discussion') {
      throw new ConflictException('This discussion is closed and can no longer receive messages');
    }
    return this.createDiscussionMessage(request, user, dto, false);
  }

  async listAccessRequests(user: AuthUser, authorization: string) {
    await this.requireSuperAdmin(user, authorization);
    return this.requests.find({ order: { created_at: 'DESC' }, take: 100 });
  }

  async getAccessRequest(user: AuthUser, authorization: string, requestId: string) {
    await this.requireSuperAdmin(user, authorization);
    const request = await this.requests.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Access request not found');
    const timeline = await this.auditLogs.find({
      where: { entity_type: 'access_request', entity_id: requestId },
      select: ['id', 'actor_user_id', 'action', 'details', 'created_at'],
      order: { created_at: 'ASC' },
    });
    return { request, timeline };
  }

  async reviewAccessRequest(
    user: AuthUser,
    authorization: string,
    requestId: string,
    dto: ReviewAccessRequestDto,
  ) {
    await this.requireSuperAdmin(user, authorization);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    let discussionTopicId: string | null = null;
    let discussionReviewerId: string | null = null;
    if (dto.status === 'discussion') {
      const current = await this.requests.findOne({ where: { id: requestId } });
      if (!current) throw new NotFoundException('Access request not found');
      if (!canTransitionAccessRequest(current.status, 'discussion')) {
        throw new ConflictException(`Access request cannot move from ${current.status} to discussion`);
      }
      if (!current.discussion_topic_id) {
        discussionReviewerId = current.assigned_to_user_id ?? user.userId;
        discussionTopicId = await this.createAccessRequestDiscussion(current, discussionReviewerId);
      }
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const requestRepo = manager.getRepository(WebsitePlatformAccessRequest);
      const invitationRepo = manager.getRepository(WebsitePlatformInvitation);
      const request = await requestRepo.findOne({
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new BadRequestException('Access request not found');
      if (!canTransitionAccessRequest(request.status, dto.status)) {
        throw new ConflictException(
          `Access request cannot move from ${request.status} to ${dto.status}`,
        );
      }
      if (dto.status === 'rejected' && !dto.decisionNote?.trim()) {
        throw new BadRequestException(
          'A decision note is required when rejecting an access request',
        );
      }

      const previousStatus = request.status;
      const isNewApproval = previousStatus !== 'approved' && dto.status === 'approved';
      const invitationToken = isNewApproval ? createInvitationToken() : null;
      request.status = dto.status;
      if (dto.internalNotes !== undefined) {
        request.internal_notes = dto.internalNotes.trim() || null;
      }
      if (dto.discussionChecklist !== undefined) {
        request.discussion_checklist = dto.discussionChecklist;
      }
      if (dto.assignToMe !== undefined) {
        request.assigned_to_user_id = dto.assignToMe ? user.userId : null;
        request.assigned_to_name = dto.assignToMe
          ? (user.username ?? user.email ?? user.userId)
          : null;
      }
      if (dto.status === 'invited') {
        if (!request.assigned_to_user_id) {
          request.assigned_to_user_id = user.userId;
          request.assigned_to_name = user.username ?? user.email ?? user.userId;
        }
      }
      if (dto.status === 'discussion') {
        if (!request.assigned_to_user_id) {
          request.assigned_to_user_id = discussionReviewerId ?? user.userId;
          request.assigned_to_name = user.username ?? user.email ?? user.userId;
        }
        request.discussion_topic_id = request.discussion_topic_id ?? discussionTopicId;
        if (!request.discussion_topic_id) {
          throw new BadRequestException('Could not create the applicant discussion room');
        }
      }
      if (dto.status === 'approved' || dto.status === 'rejected') {
        request.reviewed_by = user.userId;
        request.review_note = dto.decisionNote?.trim() || null;
      }

      if (invitationToken && isNewApproval) {
        const now = new Date();
        await invitationRepo
          .createQueryBuilder()
          .update(WebsitePlatformInvitation)
          .set({ revoked_at: now })
          .where('email = :email AND accepted_at IS NULL AND revoked_at IS NULL', {
            email: request.email,
          })
          .execute();
        const invitation = invitationRepo.create({
          email: request.email,
          role: 'designer',
          token_hash: hashInvitationToken(invitationToken),
          created_by: user.userId,
          expires_at: expiresAt,
        });
        const savedInvitation = await invitationRepo.save(invitation);
        request.invitation_id = savedInvitation.id;
      }

      const savedRequest = await requestRepo.save(request);
      await this.writeAudit(
        user.userId,
        previousStatus !== dto.status
          ? `access_request.${dto.status === 'approved' || dto.status === 'rejected' ? dto.status : 'stage_changed'}`
          : 'access_request.details_updated',
        'access_request',
        savedRequest.id,
        {
          fromStatus: previousStatus,
          toStatus: dto.status,
          email: savedRequest.email,
          decisionNote: savedRequest.review_note,
          assignedToUserId: savedRequest.assigned_to_user_id,
          assignedToName: savedRequest.assigned_to_name,
          discussionChecklist: savedRequest.discussion_checklist,
          internalNotesChanged: dto.internalNotes !== undefined,
        },
        manager,
      );

      return {
        request: savedRequest,
        statusChanged: previousStatus !== dto.status,
        invitation: invitationToken
          ? {
              token: invitationToken,
              expiresAt,
              email: savedRequest.email,
            }
          : null,
      };
    });
    if (result.statusChanged && result.request.status === 'approved' && result.invitation) {
      const acceptLink = new URL(
        `/invite/accept?token=${encodeURIComponent(result.invitation.token)}`,
        this.platformAppUrl,
      ).toString();
      const emailSent = await this.sendAccessRequestEmail(
        this.messaging.websitePlatformAccessApprovedTemplate,
        result.invitation.email,
        {
          'applicant-name': result.request.name,
          'accept-link': acceptLink,
          'expires-at': expiresAt.toLocaleString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Jakarta',
          }),
        },
        `approval email for ${result.request.id}`,
      );
      const discussionAccessRevoked = await this.revokeApplicantDiscussionAccess(result.request);
      return {
        ...result,
        invitation: { ...result.invitation, emailSent },
        discussionAccessRevoked,
      };
    }
    if (result.statusChanged && result.request.status === 'rejected') {
      const notificationEmailSent = await this.sendAccessRequestEmail(
        this.messaging.websitePlatformAccessRejectedTemplate,
        result.request.email,
        {
          'applicant-name': result.request.name,
          'decision-note': result.request.review_note ?? '',
          'application-link': new URL('/apply', this.platformAppUrl).toString(),
        },
        `rejection email for ${result.request.id}`,
      );
      const discussionAccessRevoked = await this.revokeApplicantDiscussionAccess(result.request);
      return { ...result, notificationEmailSent, discussionAccessRevoked };
    }
    if (result.statusChanged && result.request.status === 'curating') {
      const notificationEmailSent = await this.sendAccessRequestEmail(
        this.messaging.websitePlatformAccessRequestInReviewTemplate,
        result.request.email,
        {
          'applicant-name': result.request.name,
          'application-link': new URL('/apply', this.platformAppUrl).toString(),
        },
        `review email for ${result.request.id}`,
      );
      return { ...result, notificationEmailSent };
    }
    if (result.statusChanged && result.request.status === 'invited') {
      const notificationEmailSent = await this.sendAccessRequestEmail(
        this.messaging.websitePlatformDiscussionInvitationTemplate,
        result.request.email,
        {
          'applicant-name': result.request.name,
          'discussion-link': this.discussionLink(),
        },
        `discussion invitation for ${result.request.id}`,
      );
      return {
        ...result,
        notificationEmailSent,
        discussionLink: this.discussionLink(),
      };
    }
    return result;
  }

  private async revokeApplicantDiscussionAccess(
    request: WebsitePlatformAccessRequest,
  ): Promise<boolean> {
    if (!request.discussion_topic_id || !request.applicant_user_id) return true;
    try {
      await this.chat.removeDirectParticipant(
        request.discussion_topic_id,
        request.applicant_user_id,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Could not revoke discussion access for request ${request.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }

  async listInvitations(user: AuthUser, authorization: string) {
    await this.requireSuperAdmin(user, authorization);
    return this.invitations.find({
      select: [
        'id',
        'email',
        'role',
        'created_by',
        'expires_at',
        'accepted_by',
        'accepted_at',
        'revoked_at',
        'created_at',
      ],
      order: { created_at: 'DESC' },
      take: 100,
    });
  }

  async listAuditLogs(user: AuthUser, authorization: string) {
    await this.requireSuperAdmin(user, authorization);
    return this.auditLogs.find({
      select: [
        'id',
        'actor_user_id',
        'action',
        'entity_type',
        'entity_id',
        'details',
        'created_at',
      ],
      order: { created_at: 'DESC' },
      take: 100,
    });
  }

  async createInvitation(user: AuthUser, authorization: string, dto: CreatePlatformInvitationDto) {
    await this.requireSuperAdmin(user, authorization);
    const email = normalizePlatformEmail(dto.email);
    const existingMember = await this.members.findOne({
      where: { email, is_active: true },
    });
    if (existingMember) {
      throw new ConflictException('This email already has platform access');
    }

    const token = createInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await this.dataSource.transaction(async (manager) => {
      const invitationRepo = manager.getRepository(WebsitePlatformInvitation);
      await invitationRepo
        .createQueryBuilder()
        .update(WebsitePlatformInvitation)
        .set({ revoked_at: new Date() })
        .where('email = :email AND accepted_at IS NULL AND revoked_at IS NULL', { email })
        .execute();

      const invitation = await invitationRepo.save(
        invitationRepo.create({
          email,
          role: dto.role,
          token_hash: hashInvitationToken(token),
          created_by: user.userId,
          expires_at: expiresAt,
        }),
      );
      await this.writeAudit(
        user.userId,
        'invitation.created',
        'invitation',
        invitation.id,
        { email, role: dto.role },
        manager,
      );
      return {
        id: invitation.id,
        email,
        role: invitation.role,
        token,
        expiresAt,
      };
    });
    const emailSent = await this.sendPlatformInvitationEmail(
      invitation.email,
      invitation.role,
      invitation.token,
      invitation.expiresAt,
      user,
    );
    if (!emailSent) {
      this.logger.warn(`Website Platform invitation email failed for invitation ${invitation.id}`);
    }
    return { ...invitation, emailSent };
  }

  private async sendPlatformInvitationEmail(
    email: string,
    role: 'designer' | 'reviewer',
    token: string,
    expiresAt: Date,
    inviter: AuthUser,
  ): Promise<boolean> {
    const roleLabel = role === 'designer' ? 'Designer' : 'Reviewer';
    const acceptLink = new URL(
      `/invite/accept?token=${encodeURIComponent(token)}`,
      this.platformAppUrl,
    ).toString();
    return this.messaging.sendEmail({
      to: email,
      template: this.messaging.websitePlatformInvitationTemplate,
      context: {
        'website-platform-invitee-email': email,
        'inviter-name': inviter.username ?? inviter.email ?? 'Tim Bagdja',
        'platform-name': 'Bagdja Website',
        role: roleLabel,
        'accept-link': acceptLink,
        'expires-at': expiresAt.toLocaleString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Jakarta',
        }),
      },
    });
  }

  async revokeInvitation(user: AuthUser, authorization: string, invitationId: string) {
    await this.requireSuperAdmin(user, authorization);
    return this.dataSource.transaction(async (manager) => {
      const invitationRepo = manager.getRepository(WebsitePlatformInvitation);
      const invitation = await invitationRepo.findOne({
        where: { id: invitationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation) throw new BadRequestException('Invitation not found');
      if (invitation.accepted_at) {
        throw new ConflictException('An accepted invitation cannot be revoked');
      }
      if (invitation.revoked_at) {
        throw new ConflictException('Invitation has already been revoked');
      }
      invitation.revoked_at = new Date();
      await invitationRepo.save(invitation);
      await this.writeAudit(
        user.userId,
        'invitation.revoked',
        'invitation',
        invitation.id,
        { email: invitation.email },
        manager,
      );
      return { id: invitation.id, revoked: true };
    });
  }

  async acceptInvitation(user: AuthUser, token: string) {
    if (!user.email) {
      throw new ForbiddenException(
        'A verified Bagdja account email is required to accept an invitation',
      );
    }
    const tokenHash = hashInvitationToken(token);
    const email = normalizePlatformEmail(user.email);

    return this.dataSource.transaction(async (manager) => {
      const invitationRepo = manager.getRepository(WebsitePlatformInvitation);
      const invitation = await invitationRepo.findOne({
        where: { token_hash: tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation) throw new BadRequestException('Invitation is invalid');
      if (invitation.revoked_at) {
        throw new ConflictException('Invitation has been revoked');
      }
      if (invitation.accepted_at) {
        throw new ConflictException('Invitation has already been accepted');
      }
      if (invitation.expires_at <= new Date()) {
        throw new ConflictException('Invitation has expired');
      }
      if (invitation.email !== email) {
        throw new ForbiddenException(
          'Sign in with the Bagdja account invited at this email address',
        );
      }

      const memberRepo = manager.getRepository(WebsitePlatformMember);
      const emailMember = await memberRepo.findOne({
        where: { email },
        lock: { mode: 'pessimistic_write' },
      });
      if (emailMember && emailMember.user_id !== user.userId) {
        throw new ConflictException('This email is already linked to a different Bagdja account');
      }
      let member = await memberRepo.findOne({
        where: { user_id: user.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (member && member.is_active) {
        throw new ConflictException('This account already has platform access');
      }
      if (!member) {
        member = memberRepo.create({
          user_id: user.userId,
          email,
          role: invitation.role,
          is_active: true,
          invited_by: invitation.created_by,
          accepted_at: new Date(),
        });
      } else {
        member.email = email;
        member.role = invitation.role;
        member.is_active = true;
        member.invited_by = invitation.created_by;
        member.accepted_at = new Date();
      }

      invitation.accepted_by = user.userId;
      invitation.accepted_at = new Date();
      await memberRepo.save(member);
      await invitationRepo.save(invitation);
      await this.writeAudit(
        user.userId,
        'invitation.accepted',
        'invitation',
        invitation.id,
        { email, role: invitation.role },
        manager,
      );
      return { allowed: true, role: invitation.role };
    });
  }

  private async requireSuperAdmin(user: AuthUser, authorization: string) {
    const app = await this.getPlatformClientApp();
    const organizations = await this.getUserOrganizations(authorization);
    if (!isOrganizationOwnerOrAdmin(organizations, app.organizationId)) {
      throw new ForbiddenException(
        'Only an owner or admin of the Website Platform owner organization may manage platform access',
      );
    }
  }

  private async getPlatformClientApp(): Promise<PublicClientApp> {
    if (!this.platformClientId) {
      throw new ServiceUnavailableException('WEBSITE_PLATFORM_OAUTH_CLIENT_ID is not configured');
    }
    try {
      const response = await fetch(
        `${this.authServiceUrl}/auth/client/public/${encodeURIComponent(this.platformClientId)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        throw new Error(`Bagdja Auth returned ${response.status}`);
      }
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object') {
        throw new Error('Bagdja Auth returned invalid application metadata');
      }
      const app = payload as Partial<PublicClientApp>;
      if (
        app.appId !== this.platformClientId ||
        typeof app.organizationId !== 'string' ||
        !app.organizationId
      ) {
        throw new Error('Bagdja Auth returned incomplete application ownership data');
      }
      return app as PublicClientApp;
    } catch (error) {
      this.logger.error(
        `Could not verify Website Platform application ownership: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Bagdja Auth could not verify Website Platform ownership',
      );
    }
  }

  private async getUserOrganizations(authorization: string): Promise<unknown> {
    try {
      const response = await fetch(`${this.authServiceUrl}/auth/organizations`, {
        headers: { Authorization: authorization },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Bagdja Auth returned ${response.status}`);
      }
      const organizations: unknown = await response.json();
      if (!Array.isArray(organizations)) {
        throw new Error('Bagdja Auth returned an invalid organization membership response');
      }
      return organizations;
    } catch (error) {
      this.logger.error(
        `Could not verify Website Platform organization membership: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException('Bagdja Auth could not verify organization membership');
    }
  }

  private async writeAudit(
    actorUserId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    details: Record<string, unknown>,
    manager?: EntityManager,
  ) {
    const repo = manager ? manager.getRepository(WebsitePlatformAuditLog) : this.auditLogs;
    await repo.save(
      repo.create({
        actor_user_id: actorUserId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        details,
      }),
    );
  }
}
