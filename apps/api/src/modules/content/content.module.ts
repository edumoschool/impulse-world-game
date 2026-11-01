import { Module } from '@nestjs/common';
import { ContentReviewLog } from './application/review-log.js';

@Module({ providers: [ContentReviewLog], exports: [ContentReviewLog] })
export class ContentModule {}
