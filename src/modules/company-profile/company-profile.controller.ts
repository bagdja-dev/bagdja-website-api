import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard, Roles, RolesGuard, TenantStaffGuard } from '../../common/auth';

import { CompanyProfileService } from './company-profile.service';
import { ClientTranslationDto, CreateClientDto, CreatePartnerAccountDto, CreatePartnerDto, CreatePortfolioProjectDto, PartnerTranslationDto, PortfolioCategoryTranslationDto, PortfolioProjectTranslationDto, UpdateClientDto, UpdatePartnerDto, UpdatePortfolioProjectDto, UpsertPartnerCategoryDto, UpsertPortfolioCategoryDto, UpsertWebsiteLanguageDto } from './dto/company-profile.dto';

@ApiTags('Company Profile')
@Controller('api/websites/:websiteId')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class CompanyProfileController {
  constructor(private readonly service: CompanyProfileService) {}

  @Get('languages') @Roles('viewer') findLanguages(@Param('websiteId') websiteId: string) { return this.service.findLanguages(websiteId); }
  @Post('languages') @Roles('editor') upsertLanguage(@Param('websiteId') websiteId: string, @Body() dto: UpsertWebsiteLanguageDto) { return this.service.upsertLanguage(websiteId, dto); }
  @Patch('languages/:locale') @Roles('editor') updateLanguage(@Param('websiteId') websiteId: string, @Param('locale') locale: string, @Body() dto: UpsertWebsiteLanguageDto) { return this.service.upsertLanguage(websiteId, { ...dto, locale }); }
  @Delete('languages/:locale') @Roles('admin') removeLanguage(@Param('websiteId') websiteId: string, @Param('locale') locale: string) { return this.service.removeLanguage(websiteId, locale); }

  @Get('partners') @Roles('viewer') findPartners(@Param('websiteId') websiteId: string) { return this.service.findPartners(websiteId); }
  @Get('partners/:partnerId') @Roles('viewer') findPartner(@Param('websiteId') websiteId: string, @Param('partnerId') partnerId: string) { return this.service.findPartner(websiteId, partnerId); }
  @Post('partners') @Roles('editor') createPartner(@Param('websiteId') websiteId: string, @Body() dto: CreatePartnerDto) { return this.service.createPartner(websiteId, dto); }
  @Patch('partners/:partnerId') @Roles('editor') updatePartner(@Param('websiteId') websiteId: string, @Param('partnerId') partnerId: string, @Body() dto: UpdatePartnerDto) { return this.service.updatePartner(websiteId, partnerId, dto); }
  @Delete('partners/:partnerId') @Roles('admin') removePartner(@Param('websiteId') websiteId: string, @Param('partnerId') partnerId: string) { return this.service.removePartner(websiteId, partnerId); }
  @Get('partner-categories') @Roles('viewer') findPartnerCategories(@Param('websiteId') websiteId: string) { return this.service.findPartnerCategories(websiteId); }
  @Post('partner-categories') @Roles('editor') createPartnerCategory(@Param('websiteId') websiteId: string, @Body() dto: UpsertPartnerCategoryDto) { return this.service.upsertPartnerCategory(websiteId, null, dto); }
  @Patch('partner-categories/:categoryId') @Roles('editor') updatePartnerCategory(@Param('websiteId') websiteId: string, @Param('categoryId') categoryId: string, @Body() dto: UpsertPartnerCategoryDto) { return this.service.upsertPartnerCategory(websiteId, categoryId, dto); }
  @Post('partners/:partnerId/accounts') @Roles('admin') createPartnerAccount(@Param('websiteId') websiteId: string, @Param('partnerId') partnerId: string, @Body() dto: CreatePartnerAccountDto) { return this.service.createPartnerAccount(websiteId, partnerId, dto); }
  @Put('partners/:partnerId/translations/:locale') @Roles('editor') upsertPartnerTranslation(@Param('websiteId') websiteId: string, @Param('partnerId') partnerId: string, @Param('locale') locale: string, @Body() dto: PartnerTranslationDto) { return this.service.upsertPartnerTranslation(websiteId, partnerId, locale, dto); }

  @Get('clients') @Roles('viewer') findClients(@Param('websiteId') websiteId: string) { return this.service.findClients(websiteId); }
  @Post('clients') @Roles('editor') createClient(@Param('websiteId') websiteId: string, @Body() dto: CreateClientDto) { return this.service.createClient(websiteId, dto); }
  @Patch('clients/:clientId') @Roles('editor') updateClient(@Param('websiteId') websiteId: string, @Param('clientId') clientId: string, @Body() dto: UpdateClientDto) { return this.service.updateClient(websiteId, clientId, dto); }
  @Delete('clients/:clientId') @Roles('admin') removeClient(@Param('websiteId') websiteId: string, @Param('clientId') clientId: string) { return this.service.removeClient(websiteId, clientId); }
  @Put('clients/:clientId/translations/:locale') @Roles('editor') upsertClientTranslation(@Param('websiteId') websiteId: string, @Param('clientId') clientId: string, @Param('locale') locale: string, @Body() dto: ClientTranslationDto) { return this.service.upsertClientTranslation(websiteId, clientId, locale, dto); }

  @Get('portfolio-projects') @Roles('viewer') findPortfolioProjects(@Param('websiteId') websiteId: string) { return this.service.findPortfolioProjects(websiteId); }
  @Get('portfolio-projects/:projectId') @Roles('viewer') findPortfolioProject(@Param('websiteId') websiteId: string, @Param('projectId') projectId: string) { return this.service.findPortfolioProject(websiteId, projectId); }
  @Post('portfolio-projects') @Roles('editor') createPortfolioProject(@Param('websiteId') websiteId: string, @Body() dto: CreatePortfolioProjectDto) { return this.service.createPortfolioProject(websiteId, dto); }
  @Patch('portfolio-projects/:projectId') @Roles('editor') updatePortfolioProject(@Param('websiteId') websiteId: string, @Param('projectId') projectId: string, @Body() dto: UpdatePortfolioProjectDto) { return this.service.updatePortfolioProject(websiteId, projectId, dto); }
  @Delete('portfolio-projects/:projectId') @Roles('admin') removePortfolioProject(@Param('websiteId') websiteId: string, @Param('projectId') projectId: string) { return this.service.removePortfolioProject(websiteId, projectId); }
  @Put('portfolio-projects/:projectId/translations/:locale') @Roles('editor') upsertPortfolioTranslation(@Param('websiteId') websiteId: string, @Param('projectId') projectId: string, @Param('locale') locale: string, @Body() dto: PortfolioProjectTranslationDto) { return this.service.upsertPortfolioTranslation(websiteId, projectId, locale, dto); }
  @Get('portfolio-categories') @Roles('viewer') findPortfolioCategories(@Param('websiteId') websiteId: string) { return this.service.findPortfolioCategories(websiteId); }
  @Post('portfolio-categories') @Roles('editor') createPortfolioCategory(@Param('websiteId') websiteId: string, @Body() dto: UpsertPortfolioCategoryDto) { return this.service.upsertPortfolioCategory(websiteId, null, dto); }
  @Patch('portfolio-categories/:categoryId') @Roles('editor') updatePortfolioCategory(@Param('websiteId') websiteId: string, @Param('categoryId') categoryId: string, @Body() dto: UpsertPortfolioCategoryDto) { return this.service.upsertPortfolioCategory(websiteId, categoryId, dto); }
  @Put('portfolio-categories/:categoryId/translations/:locale') @Roles('editor') upsertPortfolioCategoryTranslation(@Param('websiteId') websiteId: string, @Param('categoryId') categoryId: string, @Param('locale') locale: string, @Body() dto: PortfolioCategoryTranslationDto) { return this.service.upsertPortfolioCategoryTranslation(websiteId, categoryId, locale, dto); }
}
