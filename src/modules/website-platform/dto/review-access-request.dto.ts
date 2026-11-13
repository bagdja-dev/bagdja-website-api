import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ReviewAccessRequestDto {
  @ApiProperty({
    enum: ['pending', 'curating', 'invited', 'discussion', 'approved', 'rejected'],
  })
  @IsIn(['pending', 'curating', 'invited', 'discussion', 'approved', 'rejected'])
  status: 'pending' | 'curating' | 'invited' | 'discussion' | 'approved' | 'rejected';

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string;

  @ApiPropertyOptional({
    enum: [
      'portfolio',
      'design_decisions',
      'feedback_handling',
      'workflow',
      'collaboration',
    ],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsIn(
    [
      'portfolio',
      'design_decisions',
      'feedback_handling',
      'workflow',
      'collaboration',
    ],
    { each: true },
  )
  discussionChecklist?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  assignToMe?: boolean;

  @ApiPropertyOptional({ maxLength: 2000 })
  @ValidateIf((request: ReviewAccessRequestDto) => request.status === 'rejected')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  decisionNote?: string;
}
