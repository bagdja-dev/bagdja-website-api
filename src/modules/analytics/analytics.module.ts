import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../common/auth';
import { Website, WebsiteAnalyticsEvent } from '../../entities';

import { AnalyticsController, PublicAnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Website, WebsiteAnalyticsEvent]), AuthModule],
  controllers: [AnalyticsController, PublicAnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
