import { Module } from '@nestjs/common';
import { ContentModule } from '../content/index.js';
import { CurriculumModule } from '../curriculum/index.js';
import { QuestionService } from './application/question.service.js';
import { QuestionsController } from './presentation/questions.controller.js';

@Module({
  imports: [ContentModule, CurriculumModule],
  controllers: [QuestionsController],
  providers: [QuestionService],
  exports: [QuestionService],
})
export class QuestionsModule {}
