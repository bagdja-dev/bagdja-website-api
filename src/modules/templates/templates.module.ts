import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WebsiteTemplate } from '../../entities';

import { SectionSchemasController } from './section-schemas.controller';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [TypeOrmModule.forFeature([WebsiteTemplate])],
  controllers: [TemplatesController, SectionSchemasController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
