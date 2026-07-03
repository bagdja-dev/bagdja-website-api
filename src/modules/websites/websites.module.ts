import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantStaff, Website } from '../../entities';
import { AuthModule } from '../../common/auth';
import { WebsitesController } from './websites.controller';
import { WebsitesService } from './websites.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenantStaff, Website]), AuthModule],
  controllers: [WebsitesController],
  providers: [WebsitesService],
  exports: [WebsitesService],
})
export class WebsitesModule {}
