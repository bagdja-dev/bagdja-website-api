import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantStaff, Website } from '../../entities';
import { AuthModule } from '../../common/auth';
import { UserWebsitesController, WebsitesController } from './websites.controller';
import { WebsitesService } from './websites.service';

@Module({
  imports: [TypeOrmModule.forFeature([Website, TenantStaff]), AuthModule],
  controllers: [UserWebsitesController, WebsitesController],
  providers: [WebsitesService],
  exports: [WebsitesService],
})
export class WebsitesModule {}
