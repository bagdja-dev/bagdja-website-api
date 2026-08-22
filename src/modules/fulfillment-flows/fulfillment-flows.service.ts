import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FulfillmentFlow, FulfillmentFlowStep } from '../../entities';
import { CreateFulfillmentFlowDto } from './dto/create-fulfillment-flow.dto';
import { UpdateFulfillmentFlowDto } from './dto/update-fulfillment-flow.dto';

/**
 * Order Handling Phase 3 (plan/website-builder/order-hanlde-plan.md §3.0) —
 * CRUD Master Flow (template SOP pengiriman, reusable lintas produk dalam 1
 * website). `steps` selalu diganti SELURUHNYA saat update (bukan
 * merge/patch parsial per step) — lebih sederhana daripada diffing, dan
 * flow biasanya diedit sebagai satu kesatuan SOP.
 */
@Injectable()
export class FulfillmentFlowsService {
  constructor(
    @InjectRepository(FulfillmentFlow)
    private readonly flowRepo: Repository<FulfillmentFlow>,
    @InjectRepository(FulfillmentFlowStep)
    private readonly stepRepo: Repository<FulfillmentFlowStep>,
  ) {}

  private validateSteps(steps: { sequence: number; release_percentage?: number }[]): void {
    const sequences = steps.map((s) => s.sequence);
    if (new Set(sequences).size !== sequences.length) {
      throw new BadRequestException('Sequence step harus unik dalam 1 flow');
    }
    const totalPercentage = steps.reduce((sum, s) => sum + (s.release_percentage ?? 0), 0);
    if (totalPercentage > 100.001) {
      throw new BadRequestException(
        `Total release_percentage seluruh step (${totalPercentage}%) melebihi 100%`,
      );
    }
  }

  async findAll(websiteId: string): Promise<FulfillmentFlow[]> {
    return this.flowRepo.find({
      where: { website_id: websiteId },
      relations: { steps: true },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string, websiteId: string): Promise<FulfillmentFlow> {
    const flow = await this.flowRepo.findOne({
      where: { id, website_id: websiteId },
      relations: { steps: true },
    });
    if (!flow) throw new NotFoundException('Fulfillment flow not found');
    flow.steps = [...flow.steps].sort((a, b) => a.sequence - b.sequence);
    return flow;
  }

  async create(websiteId: string, dto: CreateFulfillmentFlowDto): Promise<FulfillmentFlow> {
    this.validateSteps(dto.steps);

    const flow = await this.flowRepo.save(
      this.flowRepo.create({
        website_id: websiteId,
        name: dto.name,
        description: dto.description ?? null,
        is_active: dto.is_active ?? true,
      }),
    );

    await this.stepRepo.save(
      dto.steps.map((step) =>
        this.stepRepo.create({
          flow_id: flow.id,
          sequence: step.sequence,
          status_name: step.status_name,
          description: step.description ?? null,
          process_day: step.process_day ?? null,
          form_schema: step.form_schema ?? null,
          release_percentage: step.release_percentage ?? null,
          guaranty_days: step.guaranty_days ?? null,
        }),
      ),
    );

    return this.findOne(flow.id, websiteId);
  }

  async update(
    id: string,
    websiteId: string,
    dto: UpdateFulfillmentFlowDto,
  ): Promise<FulfillmentFlow> {
    const flow = await this.findOne(id, websiteId);

    if (dto.name !== undefined) flow.name = dto.name;
    if (dto.description !== undefined) flow.description = dto.description;
    if (dto.is_active !== undefined) flow.is_active = dto.is_active;
    await this.flowRepo.save(flow);

    if (dto.steps !== undefined) {
      this.validateSteps(dto.steps);
      await this.stepRepo.delete({ flow_id: flow.id });
      await this.stepRepo.save(
        dto.steps.map((step) =>
          this.stepRepo.create({
            flow_id: flow.id,
            sequence: step.sequence,
            status_name: step.status_name,
            description: step.description ?? null,
            process_day: step.process_day ?? null,
            form_schema: step.form_schema ?? null,
            release_percentage: step.release_percentage ?? null,
            guaranty_days: step.guaranty_days ?? null,
          }),
        ),
      );
    }

    return this.findOne(id, websiteId);
  }

  async remove(id: string, websiteId: string): Promise<void> {
    const flow = await this.findOne(id, websiteId);
    await this.flowRepo.remove(flow);
  }
}
