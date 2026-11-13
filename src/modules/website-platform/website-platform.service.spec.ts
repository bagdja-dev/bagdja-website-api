import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';

import type { AuthUser } from '../../common/auth/auth-user';
import { ChatServiceClient } from '../../common/chat-service/chat-service.client';
import { WebsitePlatformAccessRequest } from '../../entities/website-platform-access-request.entity';
import { WebsitePlatformAuditLog } from '../../entities/website-platform-audit-log.entity';
import { WebsitePlatformInvitation } from '../../entities/website-platform-invitation.entity';
import { WebsitePlatformMember } from '../../entities/website-platform-member.entity';
import { MessagingService } from '../messaging/messaging.service';

import { createInvitationToken, hashInvitationToken } from './website-platform-access.util';
import { WebsitePlatformService } from './website-platform.service';

function createService(
  invitation: Partial<WebsitePlatformInvitation> | null,
  accessRequest: Partial<WebsitePlatformAccessRequest> | null = null,
  chat: Partial<ChatServiceClient> = {},
  accessRequests: Partial<WebsitePlatformAccessRequest>[] = [],
) {
  const findOne = jest.fn().mockResolvedValue(invitation);
  const findAccessRequest = jest.fn().mockResolvedValue(accessRequest);
  const findAccessRequests = jest.fn().mockResolvedValue(accessRequests);
  const updateAccessRequest = jest.fn().mockResolvedValue({ affected: 1 });
  const findMember = jest.fn().mockResolvedValue(null);
  const config = {
    get: (key: string) =>
      ({
        BAGDJA_AUTH_API: 'https://auth.test',
        CLIENT_APP_ID: 'website-api',
        CLIENT_APP_SECRET: 'test-secret',
        WEBSITE_PLATFORM_OAUTH_CLIENT_ID: 'website-platform',
      })[key],
  } as unknown as ConfigService;
  const service = new WebsitePlatformService(
    config,
    {} as DataSource,
    {} as MessagingService,
    { findOne: findMember } as unknown as Repository<WebsitePlatformMember>,
    { findOne } as unknown as Repository<WebsitePlatformInvitation>,
    {
      findOne: findAccessRequest,
      find: findAccessRequests,
      update: updateAccessRequest,
    } as unknown as Repository<WebsitePlatformAccessRequest>,
    {} as Repository<WebsitePlatformAuditLog>,
    chat as ChatServiceClient,
  );
  return {
    service,
    findOne,
    findAccessRequest,
    findAccessRequests,
    findMember,
    updateAccessRequest,
  };
}

function makeInvitation(
  token: string,
  updates: Partial<WebsitePlatformInvitation> = {},
): Partial<WebsitePlatformInvitation> {
  return {
    email: 'invitee@example.com',
    token_hash: hashInvitationToken(token),
    expires_at: new Date(Date.now() + 60_000),
    accepted_at: null,
    revoked_at: null,
    ...updates,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('WebsitePlatformService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const applicant: AuthUser = {
    userId: 'applicant-user-id',
    email: '  Applicant@Example.com ',
  };

  it.each([
    ['pending', null],
    ['curating', null],
    ['invited', null],
    ['discussion', null],
    ['approved', null],
    ['rejected', 'The portfolio does not meet the current criteria.'],
  ] as const)(
    'returns the latest %s application without exposing internal notes',
    async (status, decisionNote) => {
      const request = {
        id: 'request-id',
        email: 'applicant@example.com',
        status,
        created_at: new Date('2026-11-10T00:00:00.000Z'),
        updated_at: new Date('2026-11-10T01:00:00.000Z'),
        review_note: decisionNote,
        internal_notes: 'Reviewer-only notes',
      } as WebsitePlatformAccessRequest;
      const { service, findAccessRequest } = createService(null, request);

      await expect(service.getMyAccessRequest(applicant)).resolves.toEqual({
        id: request.id,
        email: request.email,
        status,
        createdAt: request.created_at,
        updatedAt: request.updated_at,
        decisionNote,
      });
      expect(findAccessRequest).toHaveBeenCalledWith({
        where: [{ applicant_user_id: applicant.userId }, { email: 'applicant@example.com' }],
        order: { created_at: 'DESC' },
      });
    },
  );

  it('returns null when the user has not submitted an application', async () => {
    const { service } = createService(null);

    await expect(service.getMyAccessRequest(applicant)).resolves.toBeNull();
  });

  it('lets an applicant read only their active discussion and marks it read', async () => {
    const request = {
      id: 'request-id',
      name: 'Applicant',
      email: 'applicant@example.com',
      applicant_user_id: applicant.userId,
      discussion_topic_id: 'topic-id',
      status: 'discussion',
    } as WebsitePlatformAccessRequest;
    const listMessages = jest.fn().mockResolvedValue({ items: [{ id: 'message-id' }] });
    const markTopicRead = jest.fn().mockResolvedValue(undefined);
    const { service, findAccessRequest } = createService(null, request, {
      listMessages,
      markTopicRead,
    });

    await expect(service.getMyDiscussion(applicant)).resolves.toEqual({
      requestId: request.id,
      status: request.status,
      topicId: request.discussion_topic_id,
      viewerUserId: applicant.userId,
      applicantName: request.name,
      applicantEmail: request.email,
      messages: [{ id: 'message-id' }],
    });
    expect(findAccessRequest).toHaveBeenCalledWith({
      where: {
        applicant_user_id: applicant.userId,
        status: expect.anything(),
      },
      order: { created_at: 'DESC' },
    });
    expect(listMessages).toHaveBeenCalledWith('topic-id', 100, 0, applicant.userId);
    expect(markTopicRead).toHaveBeenCalledWith('topic-id', applicant.userId);
  });

  it('keeps an invited applicant out of the chat until discussion starts', async () => {
    const request = {
      id: 'request-id',
      name: 'Applicant',
      email: 'applicant@example.com',
      applicant_user_id: applicant.userId,
      discussion_topic_id: 'legacy-topic-id',
      status: 'invited',
    } as WebsitePlatformAccessRequest;
    const listMessages = jest.fn();
    const { service } = createService(null, request, { listMessages });

    await expect(service.getMyDiscussion(applicant)).resolves.toEqual({
      requestId: request.id,
      status: request.status,
      topicId: null,
      viewerUserId: applicant.userId,
      applicantName: request.name,
      applicantEmail: request.email,
      messages: [],
    });
    expect(listMessages).not.toHaveBeenCalled();
  });

  it('updates inbox activity after a discussion message is sent', async () => {
    const request = {
      id: 'request-id',
      applicant_user_id: applicant.userId,
      discussion_topic_id: 'topic-id',
      status: 'discussion',
      email: 'applicant@example.com',
      name: 'Applicant',
    } as WebsitePlatformAccessRequest;
    const message = {
      id: 'message-id',
      createdAt: '2026-11-10T02:00:00.000Z',
    };
    const createMessage = jest.fn().mockResolvedValue(message);
    const { service, updateAccessRequest } = createService(null, request, {
      createMessage,
    });

    await expect(
      service.sendMyDiscussionMessage(applicant, { body: 'Hello' }),
    ).resolves.toMatchObject({ message, activityUpdated: true });
    expect(updateAccessRequest).toHaveBeenCalledWith(request.id, {
      updated_at: new Date(message.createdAt),
    });
  });

  it('does not expose discussion access after the request leaves an active stage', async () => {
    const { service } = createService(null, null);

    await expect(service.getMyDiscussion(applicant)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists every stored discussion channel for a verified platform owner or admin', async () => {
    const request = {
      id: 'request-id',
      name: 'Applicant',
      email: 'applicant@example.com',
      status: 'approved',
      discussion_topic_id: 'topic-id',
      assigned_to_name: 'Reviewer',
      updated_at: new Date('2026-11-10T01:00:00.000Z'),
      created_at: new Date('2026-11-10T00:00:00.000Z'),
      review_note: 'Decision-only information',
      internal_notes: 'Reviewer-only notes',
    } as WebsitePlatformAccessRequest;
    const { service, findAccessRequests } = createService(null, null, {}, [request]);
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(200, {
          appId: 'website-platform',
          organizationId: 'owner-org',
          organizationName: 'Bagdja',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [
          {
            orgId: 'owner-org',
            isActive: true,
            role: { slug: 'admin' },
          },
        ]),
      );

    await expect(
      service.listAccessRequestDiscussions(applicant, 'Bearer admin-token'),
    ).resolves.toEqual([
      {
        id: request.id,
        name: request.name,
        email: request.email,
        status: request.status,
        topicId: request.discussion_topic_id,
        assignedToName: request.assigned_to_name,
        updatedAt: request.updated_at,
        createdAt: request.created_at,
      },
    ]);
    expect(findAccessRequests).toHaveBeenCalledWith({
      where: { discussion_topic_id: expect.anything() },
      order: { updated_at: 'DESC', created_at: 'DESC' },
    });
  });

  it('lets admins read a stored discussion after its request is closed', async () => {
    const request = {
      id: 'request-id',
      name: 'Applicant',
      email: 'applicant@example.com',
      status: 'approved',
      discussion_topic_id: 'topic-id',
    } as WebsitePlatformAccessRequest;
    const listMessages = jest.fn().mockResolvedValue({ items: [{ id: 'message-id' }] });
    const addDirectParticipant = jest.fn().mockResolvedValue(undefined);
    const { service, findAccessRequest } = createService(null, request, {
      listMessages,
      addDirectParticipant,
      markTopicRead: jest.fn().mockResolvedValue(undefined),
    });
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(200, {
          appId: 'website-platform',
          organizationId: 'owner-org',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [
          {
            orgId: 'owner-org',
            isActive: true,
            role: { slug: 'admin' },
          },
        ]),
      );

    await expect(
      service.getAccessRequestDiscussion(applicant, '******', request.id),
    ).resolves.toMatchObject({
      status: 'approved',
      topicId: 'topic-id',
      messages: [{ id: 'message-id' }],
    });
    expect(findAccessRequest).toHaveBeenCalledWith({
      where: { id: request.id, discussion_topic_id: expect.anything() },
    });
    expect(listMessages).toHaveBeenCalledWith('topic-id', 100, 0, applicant.userId);
    expect(addDirectParticipant).toHaveBeenCalledWith(
      'topic-id',
      applicant.userId,
      applicant.email,
    );
  });

  it('lists a designer’s own historical access discussion after approval', async () => {
    const request = {
      id: 'request-id',
      name: 'Applicant',
      email: 'applicant@example.com',
      applicant_user_id: applicant.userId,
      status: 'approved',
      discussion_topic_id: 'topic-id',
      assigned_to_name: 'Reviewer',
      updated_at: new Date('2026-11-10T01:00:00.000Z'),
      created_at: new Date('2026-11-10T00:00:00.000Z'),
    } as WebsitePlatformAccessRequest;
    const { service, findAccessRequests, findMember } = createService(
      null,
      null,
      {},
      [request],
    );
    findMember.mockResolvedValue({ role: 'designer' });
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(200, {
          appId: 'website-platform',
          organizationId: 'owner-org',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [
          {
            orgId: 'owner-org',
            isActive: true,
            role: { slug: 'member' },
          },
        ]),
      );

    await expect(
      service.listAccessRequestDiscussions(applicant, '******'),
    ).resolves.toMatchObject([
      {
        id: request.id,
        status: 'approved',
        topicId: 'topic-id',
      },
    ]);
    expect(findMember).toHaveBeenCalledWith({
      where: { user_id: applicant.userId, is_active: true },
    });
    expect(findAccessRequests).toHaveBeenCalledWith({
      where: {
        applicant_user_id: applicant.userId,
        discussion_topic_id: expect.anything(),
      },
      order: { updated_at: 'DESC', created_at: 'DESC' },
    });
  });

  it('lets the owning designer read a historical access discussion', async () => {
    const request = {
      id: 'request-id',
      name: 'Applicant',
      email: 'applicant@example.com',
      applicant_user_id: applicant.userId,
      status: 'approved',
      discussion_topic_id: 'topic-id',
    } as WebsitePlatformAccessRequest;
    const listMessages = jest.fn().mockResolvedValue({ items: [{ id: 'message-id' }] });
    const markTopicRead = jest.fn().mockResolvedValue(undefined);
    const { service, findAccessRequest, findMember } = createService(
      null,
      request,
      { listMessages, markTopicRead },
    );
    findMember.mockResolvedValue({ role: 'designer' });
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(200, {
          appId: 'website-platform',
          organizationId: 'owner-org',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [
          {
            orgId: 'owner-org',
            isActive: true,
            role: { slug: 'member' },
          },
        ]),
      );

    await expect(
      service.getAccessRequestDiscussion(applicant, '******', request.id),
    ).resolves.toMatchObject({
      status: 'approved',
      topicId: 'topic-id',
      messages: [{ id: 'message-id' }],
    });
    expect(findAccessRequest).toHaveBeenCalledWith({
      where: {
        id: request.id,
        discussion_topic_id: expect.anything(),
      },
    });
    expect(listMessages).toHaveBeenCalledWith('topic-id', 100, 0, applicant.userId);
    expect(markTopicRead).toHaveBeenCalledWith('topic-id', applicant.userId);
  });

  it('denies access to the discussion inbox for non-admin organization members', async () => {
    const { service, findAccessRequests } = createService(null);
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(200, {
          appId: 'website-platform',
          organizationId: 'owner-org',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [
          {
            orgId: 'owner-org',
            isActive: true,
            role: { slug: 'member' },
          },
        ]),
      );

    await expect(
      service.listAccessRequestDiscussions(applicant, 'Bearer member-token'),
    ).rejects.toMatchObject({ status: 403 });
    expect(findAccessRequests).not.toHaveBeenCalled();
  });

  it('returns the invited email and verified registration status', async () => {
    const token = createInvitationToken();
    const { service } = createService(makeInvitation(token));
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { 'x-api-token': 'client-token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(200, { emailVerified: true }));

    await expect(service.getInvitationRegistrationStatus(token)).resolves.toEqual({
      registered: true,
      email: 'invitee@example.com',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][0])).toBe(
      'https://auth.test/auth/users/by-username/invitee%40example.com',
    );
    expect(new Headers(fetch.mock.calls[1][1]?.headers).get('x-api-token')).toBe('client-token');
  });

  it('routes a missing or unverified account to registration', async () => {
    const token = createInvitationToken();
    const { service } = createService(makeInvitation(token));
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { 'x-api-token': 'client-token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(404, { message: 'Not found' }));

    await expect(service.getInvitationRegistrationStatus(token)).resolves.toEqual({
      registered: false,
      email: 'invitee@example.com',
    });

    const unverifiedToken = createInvitationToken();
    const unverifiedService = createService(makeInvitation(unverifiedToken)).service;
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { 'x-api-token': 'client-token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(200, { emailVerified: false }));

    await expect(
      unverifiedService.getInvitationRegistrationStatus(unverifiedToken),
    ).resolves.toEqual({ registered: false, email: 'invitee@example.com' });
  });

  it.each([
    ['missing', null],
    ['expired', makeInvitation('placeholder', { expires_at: new Date(0) })],
    ['revoked', makeInvitation('placeholder', { revoked_at: new Date() })],
    ['accepted', makeInvitation('placeholder', { accepted_at: new Date() })],
  ])('does not disclose account status for a %s invitation', async (_, invitation) => {
    const { service } = createService(invitation);
    const fetch = jest.spyOn(globalThis, 'fetch');

    await expect(
      service.getInvitationRegistrationStatus(createInvitationToken()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not treat an Auth service failure as an unregistered account', async () => {
    const token = createInvitationToken();
    const { service } = createService(makeInvitation(token));
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { 'x-api-token': 'client-token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(503, { message: 'Unavailable' }));

    await expect(service.getInvitationRegistrationStatus(token)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
