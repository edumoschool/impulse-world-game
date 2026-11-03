import { Module } from '@nestjs/common';
import { ContentModule } from '../content/index.js';
import { CurriculumModule } from '../curriculum/index.js';
import { LearningProgressModule } from '../learning-progress/index.js';
import { LessonsModule } from '../lessons/index.js';
import { LearningPathService } from './application/learning-path.service.js';
import { LearningPathsController } from './presentation/learning-paths.controller.js';

@Module({
  imports: [ContentModule, CurriculumModule, LearningProgressModule, LessonsModule],
  controllers: [LearningPathsController],
  providers: [LearningPathService],
  exports: [LearningPathService],
})
export class LearningPathsModule {}
