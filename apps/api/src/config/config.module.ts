import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, parseConfig } from './app-config.js';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => parseConfig(process.env) }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
