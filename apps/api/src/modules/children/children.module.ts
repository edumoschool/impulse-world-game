import { Module } from '@nestjs/common';
import { GuardiansModule } from '../guardians/index.js';
import { ChildLoginService } from './application/child-login.service.js';
import { ChildService } from './application/child.service.js';
import { ChildrenController } from './presentation/children.controller.js';

@Module({
  imports: [GuardiansModule],
  controllers: [ChildrenController],
  providers: [ChildLoginService, ChildService],
  exports: [ChildService],
})
export class ChildrenModule {}
