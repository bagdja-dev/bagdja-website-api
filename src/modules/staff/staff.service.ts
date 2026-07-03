import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { StaffInvitation, TenantStaff } from '../../entities';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
    @InjectRepository(StaffInvitation)
    private readonly invitationRepo: Repository<StaffInvitation>,
  ) {}

  // ─── Staff CRUD ────────────────────────────────────────────────

  async getStaffByWebsite(websiteId: string) {
    return this.staffRepo.find({
      where: { website_id: websiteId },
      order: { role: 'ASC', created_at: 'ASC' },
    });
  }

  async updateStaff(staffId: string, dto: UpdateStaffDto) {
    const staff = await this.staffRepo.findOne({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff not found');

    if (staff.role === 'owner') {
      throw new BadRequestException('Cannot modify owner role');
    }

    Object.assign(staff, dto);
    return this.staffRepo.save(staff);
  }

  async removeStaff(staffId: string) {
    const staff = await this.staffRepo.findOne({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff not found');

    if (staff.role === 'owner') {
      throw new BadRequestException('Cannot remove owner');
    }

    await this.staffRepo.remove(staff);
    return { deleted: true };
  }

  // ─── Invitation CRUD ──────────────────────────────────────────

  async getInvitations(websiteId: string) {
    return this.invitationRepo.find({
      where: { website_id: websiteId },
      order: { created_at: 'DESC' },
    });
  }

  async createInvitation(websiteId: string, invitedBy: string, dto: CreateInvitationDto) {
    const existingStaff = await this.staffRepo.findOne({
      where: { website_id: websiteId, email: dto.email },
    });
    if (existingStaff) {
      throw new ConflictException('User with this email is already a staff member');
    }

    const pendingInvitation = await this.invitationRepo.findOne({
      where: {
        website_id: websiteId,
        email: dto.email,
        is_accepted: false,
        expires_at: MoreThan(new Date()),
      },
    });
    if (pendingInvitation) {
      throw new ConflictException('A pending invitation already exists for this email');
    }

    const invitation = this.invitationRepo.create({
      website_id: websiteId,
      email: dto.email,
      role: dto.role ?? 'editor',
      invited_by: invitedBy,
      token: randomUUID(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    return this.invitationRepo.save(invitation);
  }

  async cancelInvitation(invitationId: string) {
    const invitation = await this.invitationRepo.findOne({
      where: { id: invitationId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');

    if (invitation.is_accepted) {
      throw new BadRequestException('Invitation already accepted');
    }

    await this.invitationRepo.remove(invitation);
    return { deleted: true };
  }

  async acceptInvitation(token: string, userId: string, userEmail?: string) {
    const invitation = await this.invitationRepo.findOne({
      where: { token, is_accepted: false },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found or already accepted');
    }

    if (invitation.expires_at < new Date()) {
      throw new BadRequestException('Invitation has expired');
    }

    const existingStaff = await this.staffRepo.findOne({
      where: { website_id: invitation.website_id, user_id: userId },
    });
    if (existingStaff) {
      invitation.is_accepted = true;
      invitation.accepted_at = new Date();
      await this.invitationRepo.save(invitation);
      return existingStaff;
    }

    const staff = this.staffRepo.create({
      website_id: invitation.website_id,
      user_id: userId,
      email: userEmail ?? invitation.email,
      role: invitation.role,
      invited_by: invitation.invited_by,
      invited_at: invitation.created_at,
      accepted_at: new Date(),
      is_active: true,
    });

    const savedStaff = await this.staffRepo.save(staff);

    invitation.is_accepted = true;
    invitation.accepted_at = new Date();
    await this.invitationRepo.save(invitation);

    return savedStaff;
  }
}
