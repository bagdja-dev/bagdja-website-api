import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ReviewTemplateSubmissionDto {
  @ApiProperty({ enum: ['in_review', 'changes_requested', 'approved', 'rejected'] })
  @IsIn(['in_review', 'changes_requested', 'approved', 'rejected'])
  status: 'in_review' | 'changes_requested' | 'approved' | 'rejected';

  @ApiPropertyOptional({ maxLength: 3000 })
  @ValidateIf((dto: ReviewTemplateSubmissionDto) =>
    dto.status === 'changes_requested' || dto.status === 'rejected',
  )
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  reviewNote?: string;
}
