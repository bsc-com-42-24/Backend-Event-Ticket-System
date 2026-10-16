import { Test, TestingModule } from '@nestjs/testing';
import { TicketPurchasesService } from './ticket-purchases.service.js';

describe('TicketPurchasesService', () => {
  let service: TicketPurchasesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TicketPurchasesService],
    }).compile();

    service = module.get<TicketPurchasesService>(TicketPurchasesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
