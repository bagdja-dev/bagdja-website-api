import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, IsUUID, ValidateNested } from 'class-validator';

export class FinalGatheringOptionDto {
  @IsString()
  option_group_key: string;

  @IsUUID()
  option_id: string;
}

export class ConfirmGatheringEventDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FinalGatheringOptionDto)
  final_selections: FinalGatheringOptionDto[];
}
