import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../entities/user.entity';
import type { AuthUser } from '../../common/auth/jwt.strategy';
import { AuthProfileService } from './auth-profile.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly authProfile: AuthProfileService,
  ) {}

  /**
   * Upsert user on authenticated request — mirrors bagdja-wallet pattern.
   */
  async upsertUser(authUser: AuthUser, req?: { headers?: Record<string, string | string[] | undefined> }): Promise<User> {
    const { userId } = authUser;
    let profile: Awaited<ReturnType<AuthProfileService['fetchProfile']>> = null;

    if (req) {
      profile = await this.authProfile.fetchProfile(req);
    }

    const profileUser = profile?.user ?? profile;
    const email = profileUser?.email ?? authUser.email ?? null;
    const username =
      profileUser?.username ??
      profileUser?.preferred_username ??
      authUser.username ??
      null;
    const name = profileUser?.name ?? profileUser?.full_name ?? null;

    let user = await this.userRepo.findOne({ where: { id: userId } });

    if (user) {
      user.updated_at = new Date();
      user.last_login_at = new Date();
      if (email && !user.email) user.email = email;
      if (username && !user.username) user.username = username;
      if (name && !user.name) user.name = name;
      this.logger.debug(`User updated: ${userId}`);
    } else {
      user = this.userRepo.create({
        id: userId,
        email,
        username,
        name,
        last_login_at: new Date(),
      });
      this.logger.log(`User created: ${userId}`);
    }

    return this.userRepo.save(user);
  }

  async getUserById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }
}
