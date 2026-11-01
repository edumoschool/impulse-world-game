import { Module } from '@nestjs/common';
import { ContentTransitions } from './application/content-transitions.js';
import { ContentReviewLog } from './application/review-log.js';

@Module({
  providers: [ContentReviewLog, ContentTransitions],
  exports: [ContentReviewLog, ContentTransitions],
})
export class ContentModule {}
