import { ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class CollectiveGatheringCheckoutDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  registration_ids: string[];
}
