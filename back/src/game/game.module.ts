import { Module } from '@nestjs/common';
import { CombatService } from './combat.service';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { NpcsService } from './npcs.service';

@Module({
  controllers: [GameController],
  providers: [GameService, CombatService, NpcsService],
})
export class GameModule {}
