import { ArrayNotEmpty, ArrayUnique, IsArray, IsString, IsUUID, Length } from 'class-validator';

export class RejectGatheringRegistrationsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  registration_ids: string[];

  @IsString()
  @Length(1, 2000)
  message: string;
}
