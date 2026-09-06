import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuoteEntity } from './entities/quote.entity';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

@Module({
  imports: [TypeOrmModule.forFeature([QuoteEntity])],
  controllers: [ProcurementController],
  providers: [ProcurementService],
})
export class ProcurementModule {}
