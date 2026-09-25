import { IsOptional, IsString, MinLength } from 'class-validator';

export class SendWebsiteChatMessageDto {
  @IsString()
  @MinLength(1)
  body: string;

  @IsOptional()
  @IsString()
  author_name?: string;
}
