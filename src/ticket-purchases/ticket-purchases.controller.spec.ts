import { Test, TestingModule } from '@nestjs/testing';
import { TicketPurchasesController } from './ticket-purchases.controller';
import { TicketPurchasesService } from './ticket-purchases.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('TicketPurchasesController', () => {
  let controller: TicketPurchasesController;
  const service = { purchaseTickets: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketPurchasesController],
      providers: [{ provide: TicketPurchasesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(TicketPurchasesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes the logged-in user id and the body to the service', async () => {
    service.purchaseTickets.mockResolvedValue({ orderId: '7' });
    const user = { userId: '5', email: 'a@b.com', role: 'ATTENDEE' } as any;
    const dto = { ticketTypeId: 1, quantity: 2 };

    const result = await controller.purchaseTickets(user, dto);

    expect(service.purchaseTickets).toHaveBeenCalledWith('5', dto);
    expect(result).toEqual({ orderId: '7' });
  });
});