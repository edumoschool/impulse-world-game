import { Module } from '@nestjs/common';
import { GuardianService } from './guardian.service.js';

@Module({ providers: [GuardianService], exports: [GuardianService] })
export class GuardiansModule {}
