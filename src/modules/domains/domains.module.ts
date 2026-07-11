import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Website } from '../../entities';
import { AuthModule } from '../../common/auth';
import { CoolifyService } from './coolify.service';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';

@Module({
  imports: [TypeOrmModule.forFeature([Website]), AuthModule],
  controllers: [DomainsController],
  providers: [DomainsService, CoolifyService],
})
export class DomainsModule {}
