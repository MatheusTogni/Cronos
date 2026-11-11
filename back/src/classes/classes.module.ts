import { Module } from '@nestjs/common';
import { ClassesController, ConditionsController } from './classes.controller';

@Module({
  controllers: [ClassesController, ConditionsController],
})
export class ClassesModule {}
