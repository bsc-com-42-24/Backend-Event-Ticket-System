import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

describe('TicketsController', () => {
  let controller: TicketsController;
  const service = { findMine: jest.fn().mockResolvedValue([]) };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [{ provide: TicketsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(TicketsController);
  });

  it('lists my tickets', async () => {
    const user = { userId: '5' } as any;
    await controller.findMine(user);
    expect(service.findMine).toHaveBeenCalledWith(user);
  });
});