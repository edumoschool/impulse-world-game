import { Module } from '@nestjs/common';
import { ContentModule } from '../content/index.js';
import { CurriculumModule } from '../curriculum/index.js';
import { QuestionsModule } from '../questions/index.js';
import { LessonService } from './application/lesson.service.js';
import { LessonsController } from './presentation/lessons.controller.js';

@Module({
  imports: [ContentModule, CurriculumModule, QuestionsModule],
  controllers: [LessonsController],
  providers: [LessonService],
  exports: [LessonService],
})
export class LessonsModule {}
