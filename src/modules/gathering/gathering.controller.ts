import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';

import { CreateGatheringPlanDto } from './dto/create-gathering-plan.dto';
import { GatheringPlanResponseDto } from './dto/gathering-plan-response.dto';
import { UpdateGatheringPlanDto } from './dto/update-gathering-plan.dto';
import { GatheringOccurrenceService } from './gathering-occurrence.service';

@ApiTags('Gathering Plans')
@Controller('api/gathering')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GatheringController {
  constructor(private readonly occurrenceService: GatheringOccurrenceService) {}

  @Post('plans')
  @ApiOperation({
    summary: 'Create a gathering plan in the initiator cart',
    description: 'Creates the plan order (website_orders PENDING, quantity 0, never checked out) plus the PREORDER group and occurrence attached to it.',
  })
  @ApiCreatedResponse({ type: GatheringPlanResponseDto, description: 'Plan dibuat; `order_id` adalah order rencana yang kini ada di cart initiator.' })
  createPlan(@CurrentUser() user: AuthUser, @Body() dto: CreateGatheringPlanDto): Promise<GatheringPlanResponseDto> {
    return this.occurrenceService.createPlan(user, dto);
  }

  @Get('plans')
  @ApiOperation({ summary: 'List open gathering plans (not cancelled/completed) for the current initiator in a website' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  @ApiOkResponse({ type: GatheringPlanResponseDto, isArray: true, description: 'Plan aktif milik initiator di website ini, terbaru dulu.' })
  listPlans(@CurrentUser() user: AuthUser, @Query('website_id') websiteId: string): Promise<GatheringPlanResponseDto[]> {
    return this.occurrenceService.listPlansForInitiator(websiteId, user.userId);
  }

  @Get('plans/:id')
  @ApiOperation({ summary: 'Get a gathering plan owned by the current initiator' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  @ApiOkResponse({ type: GatheringPlanResponseDto, description: 'Detail plan beserta occurrence-nya.' })
  getPlan(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('website_id') websiteId: string): Promise<GatheringPlanResponseDto> {
    return this.occurrenceService.findPlanForInitiator(id, websiteId, user.userId);
  }

  @Patch('plans/:id')
  @ApiOperation({ summary: 'Update PREORDER plan title or invitation policy' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  @ApiOkResponse({ type: GatheringPlanResponseDto, description: 'Plan setelah judul/kebijakan undangan diperbarui.' })
  updatePlan(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('website_id') websiteId: string,
    @Body() dto: UpdateGatheringPlanDto,
  ): Promise<GatheringPlanResponseDto> {
    return this.occurrenceService.updatePlanForInitiator(id, websiteId, user.userId, dto);
  }
}