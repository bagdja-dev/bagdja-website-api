import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { normalizedVideos } from '../products/products.service';
import { createUploadTicket, uploadTicketSecret, verifyUploadTicket } from './upload-ticket';
import { UploadsService } from './uploads.service';

const user = { userId: 'user-1', email: 'staff@example.com' };
const WEBSITE = '11111111-1111-4111-8111-111111111111';

function setup({ isStaff = true, env = { CLIENT_APP_SECRET: 'client-secret' } as Record<string, string> } = {}) {
  const storage = {
    uploadFile: jest.fn().mockResolvedValue({
      fileId: 'file-1', url: 'https://cdn.example.com/org/app/uuid-demo.mp4', path: 'org/app/uuid-demo.mp4',
      mimeType: 'video/mp4', sizeBytes: 3, isPublic: true,
    }),
  };
  const staffRepo = { findOne: jest.fn().mockResolvedValue(isStaff ? { id: 'staff-1' } : null) };
  const config = { get: (key: string) => env[key] };
  const service = new UploadsService(storage as never, staffRepo as never, config as never);
  return { service, storage, staffRepo };
}

const video = (overrides: Partial<Express.Multer.File> = {}) => ({
  originalname: 'demo.mp4', mimetype: 'video/mp4', size: 3, buffer: Buffer.from('abc'), ...overrides,
}) as Express.Multer.File;

describe('UploadsService — product video through an upload ticket', () => {
  it('issues a ticket to website staff and uploads the video to storage-service with it', async () => {
    const { service, storage } = setup();
    const { ticket, max_bytes, mime_types } = await service.createVideoUploadTicket(user, WEBSITE);
    expect(max_bytes).toBe(15 * 1024 * 1024);
    expect(mime_types).toEqual(['video/mp4', 'video/webm', 'video/quicktime']);

    await expect(service.uploadVideoWithTicket(ticket, video()))
      .resolves.toEqual({ url: 'https://cdn.example.com/org/app/uuid-demo.mp4', path: 'org/app/uuid-demo.mp4' });
    expect(storage.uploadFile).toHaveBeenCalledWith(Buffer.from('abc'), 'video/mp4', 'demo.mp4', 'product_video');
  });

  it('rejects missing, forged, or expired tickets, and wrong file types or sizes', async () => {
    const { service, storage } = setup();
    const { ticket } = await service.createVideoUploadTicket(user, WEBSITE);
    await expect(service.uploadVideoWithTicket(undefined, video())).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.uploadVideoWithTicket(`${ticket}x`, video())).rejects.toBeInstanceOf(UnauthorizedException);
    const expired = createUploadTicket({ w: WEBSITE, u: 'user-1' }, uploadTicketSecret({ CLIENT_APP_SECRET: 'client-secret' })!, Date.now() - 11 * 60 * 1000);
    await expect(service.uploadVideoWithTicket(expired.ticket, video())).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.uploadVideoWithTicket(ticket, video({ mimetype: 'image/png' }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.uploadVideoWithTicket(ticket, video({ size: 15 * 1024 * 1024 + 1 }))).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('refuses non-staff, both when issuing and when the ticket holder lost access', async () => {
    const denied = setup({ isStaff: false });
    await expect(denied.service.createVideoUploadTicket(user, WEBSITE)).rejects.toBeInstanceOf(ForbiddenException);

    const { service, staffRepo, storage } = setup();
    const { ticket } = await service.createVideoUploadTicket(user, WEBSITE);
    staffRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.uploadVideoWithTicket(ticket, video())).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('prefers UPLOAD_TICKET_SECRET and never accepts a ticket signed with another secret', () => {
    expect(uploadTicketSecret({})).toBeNull();
    expect(uploadTicketSecret({ UPLOAD_TICKET_SECRET: 'explicit', CLIENT_APP_SECRET: 'x' })).toBe('explicit');
    const { ticket } = createUploadTicket({ w: WEBSITE, u: 'user-1' }, 'secret-a');
    expect(verifyUploadTicket(ticket, 'secret-b')).toBeNull();
    expect(verifyUploadTicket(ticket, 'secret-a')).toMatchObject({ w: WEBSITE, u: 'user-1' });
  });
});

describe('normalizedVideos', () => {
  it('keeps video_url as the first of video_urls, and supports clients that only send video_url', () => {
    expect(normalizedVideos([' https://a/1.mp4 ', '', 'https://a/2.mp4'], undefined))
      .toEqual({ video_urls: ['https://a/1.mp4', 'https://a/2.mp4'], video_url: 'https://a/1.mp4' });
    expect(normalizedVideos([], 'https://a/old.mp4')).toEqual({ video_urls: [], video_url: null });
    expect(normalizedVideos(undefined, 'https://a/old.mp4')).toEqual({ video_urls: ['https://a/old.mp4'], video_url: 'https://a/old.mp4' });
    expect(normalizedVideos(undefined, null)).toEqual({ video_urls: [], video_url: null });
  });
});
