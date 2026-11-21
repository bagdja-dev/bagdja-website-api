import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Website } from '../../entities';
import { AuthModule } from '../../common/auth';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { TraefikConfigController } from './traefik-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Website]), AuthModule],
  controllers: [DomainsController, TraefikConfigController],
  providers: [DomainsService],
})
export class DomainsModule {}
