import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';

import { SELECTABLE_BUSINESS_PROFILE_IDS } from './business-profile.registry';
import { BusinessProfilesResponseDto, BusinessProfileWaitlistResponseDto } from './dto/business-profile.dto';
import { WebsiteModulesService } from './website-modules.service';

@ApiTags('Business Profiles')
@Controller('api/business-profiles')
export class BusinessProfilesController {
  constructor(private readonly modulesService: WebsiteModulesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List business profiles and the module registry (Studio onboarding wizard & Fitur page)',
  })
  @ApiOkResponse({
    type: BusinessProfilesResponseDto,
    description:
      '9 jenis bisnis (tanpa `legacy`) dengan status `available`/`coming_soon` dan preset modul yang sudah di-resolve, ' +
      'plus registry modul lengkap (label, deskripsi, inti, dependensi, status, ownerOnly).',
  })
  listProfiles(): BusinessProfilesResponseDto {
    return this.modulesService.listBusinessProfiles();
  }

  @Post(':profileId/waitlist')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register interest ("Kabari saya") for a coming-soon business profile (idempotent)' })
  @ApiParam({ name: 'profileId', enum: SELECTABLE_BUSINESS_PROFILE_IDS, example: 'place_rental' })
  @ApiOkResponse({
    type: BusinessProfileWaitlistResponseDto,
    description: 'Minat tercatat (user, profile, waktu). Memanggil ulang tidak membuat baris ganda.',
  })
  @ApiBadRequestResponse({ description: 'Profile sudah `available` (daftar minat hanya untuk `coming_soon`).' })
  @ApiNotFoundResponse({ description: 'Profile tidak dikenal atau `legacy`.' })
  registerWaitlist(
    @CurrentUser() user: AuthUser,
    @Param('profileId') profileId: string,
  ): Promise<BusinessProfileWaitlistResponseDto> {
    return this.modulesService.registerWaitlist(user.userId, profileId);
  }
}
