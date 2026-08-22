import { PartialType } from '@nestjs/swagger';

import { CreateFulfillmentFlowDto } from './create-fulfillment-flow.dto';

/** `steps`, kalau dikirim, MENGGANTI SELURUH step lama (bukan merge/patch parsial). */
export class UpdateFulfillmentFlowDto extends PartialType(CreateFulfillmentFlowDto) {}
