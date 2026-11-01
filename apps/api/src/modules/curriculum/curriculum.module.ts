import { Module } from '@nestjs/common';
import { CurriculumService } from './application/curriculum.service.js';
import { CurriculumController } from './presentation/curriculum.controller.js';

@Module({
  controllers: [CurriculumController],
  providers: [CurriculumService],
  exports: [CurriculumService],
})
export class CurriculumModule {}
