import { Module } from '@nestjs/common';
import { CombatService } from './combat.service';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { NpcsService } from './npcs.service';
import { TransfersService } from './transfers.service';

@Module({
  controllers: [GameController],
  providers: [GameService, CombatService, NpcsService, TransfersService],
})
export class GameModule {}
