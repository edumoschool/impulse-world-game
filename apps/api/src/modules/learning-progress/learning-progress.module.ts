import { Module } from '@nestjs/common';
import { AssessmentsModule } from '../assessments/index.js';
import { ChildrenModule } from '../children/index.js';
import { LessonsModule } from '../lessons/index.js';
import { QuestionsModule } from '../questions/index.js';
import { AssessmentEvidenceConsumer } from './application/assessment-evidence.consumer.js';
import { ProgressService } from './application/progress.service.js';
import { ProgressController } from './presentation/progress.controller.js';

@Module({
  imports: [AssessmentsModule, ChildrenModule, LessonsModule, QuestionsModule],
  controllers: [ProgressController],
  providers: [ProgressService, AssessmentEvidenceConsumer],
  exports: [ProgressService],
})
export class LearningProgressModule {}
