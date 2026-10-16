import { Test, TestingModule } from '@nestjs/testing';
import { TicketPurchasesController } from './ticket-purchases.controller.js';

describe('TicketPurchasesController', () => {
  let controller: TicketPurchasesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketPurchasesController],
    }).compile();

    controller = module.get<TicketPurchasesController>(TicketPurchasesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
