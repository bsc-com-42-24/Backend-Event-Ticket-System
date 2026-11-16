import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';
import type { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const client = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const database = {
    getClient: jest.fn(),
  };
  let service: OrdersService;

  beforeEach(() => {
    jest.clearAllMocks();
    database.getClient.mockResolvedValue(client);
    service = new OrdersService(database as never);
  });

  it('rejects orders for events that have started or ended', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            status: 'PUBLISHED',
            start_at: new Date('2020-03-10T16:00:00.000Z'),
            end_at: new Date('2020-03-10T20:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({});

    const user: AuthenticatedUser = {
      userId: '5',
      email: 'customer@example.com',
      role: UserRole.CUSTOMER,
    };
    const input: CreateOrderDto = {
      eventId: '7',
      items: [{ ticketTypeId: '3', quantity: 1 }],
    };

    await expect(service.createOrder(user, input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
    expect(
      client.query.mock.calls.some((call: unknown[]) =>
        String(call[0]).includes('INSERT INTO orders'),
      ),
    ).toBe(false);
  });
});
