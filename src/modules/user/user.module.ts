import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../../entities/user.entity';
import { AuthProfileService } from './auth-profile.service';
import { UserService } from './user.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [AuthProfileService, UserService],
  exports: [AuthProfileService, UserService],
})
export class UserModule {}
