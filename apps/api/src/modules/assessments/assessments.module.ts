import { Module } from '@nestjs/common';
import { ContentModule } from '../content/index.js';
import { CurriculumModule } from '../curriculum/index.js';
import { QuestionsModule } from '../questions/index.js';
import { AssessmentAuthoringService } from './application/assessment-authoring.service.js';
import { AttemptService } from './application/attempt.service.js';
import { AssessmentsController } from './presentation/assessments.controller.js';

@Module({
  imports: [ContentModule, CurriculumModule, QuestionsModule],
  controllers: [AssessmentsController],
  providers: [AssessmentAuthoringService, AttemptService],
  exports: [AssessmentAuthoringService, AttemptService],
})
export class AssessmentsModule {}
