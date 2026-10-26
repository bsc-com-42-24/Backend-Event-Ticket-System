import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Order, OrderStatus } from './entities/order.entity';
import { TicketType } from '../ticket-types/entities/ticket-type.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { FilterOrdersDto } from './dto/filter-orders.dto';

/**
 * Service managing ticket orders, administrative lifecycle operations, and stock inventory.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(TicketType)
    private readonly ticketTypeRepository: Repository<TicketType>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Helper creation method for testing order reservation flow.
   * Decrements remaining inventory and calculates expiration timestamp based on configuration.
   * @param dto - Order reservation payload.
   * @returns Newly created pending order.
   */
  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const ticketType = await queryRunner.manager.findOne(TicketType, {
        where: { id: dto.ticketTypeId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!ticketType) {
        throw new NotFoundException(
          `TicketType with ID "${dto.ticketTypeId}" not found.`,
        );
      }

      if (ticketType.remainingQuantity < dto.quantity) {
        throw new BadRequestException(
          `Insufficient ticket quantity remaining. Requested: ${dto.quantity}, Available: ${ticketType.remainingQuantity}.`,
        );
      }

      ticketType.remainingQuantity -= dto.quantity;
      await queryRunner.manager.save(ticketType);

      const expiryMinutes = this.configService.get<number>(
        'ORDER_EXPIRY_MINUTES',
        15,
      );
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
      const totalAmount = Number(ticketType.price) * dto.quantity;

      const order = queryRunner.manager.create(Order, {
        customerId: dto.customerId,
        ticketTypeId: dto.ticketTypeId,
        quantity: dto.quantity,
        totalAmount,
        status: OrderStatus.PENDING,
        expiresAt,
      });

      const savedOrder = await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();
      return savedOrder;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * List all orders filtered by optional query criteria.
   * @param filter - Optional filters such as status, eventId, customerId.
   * @returns Filtered array of orders with relation details.
   */
  async findAll(filter?: FilterOrdersDto): Promise<Order[]> {
    const query = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.ticketType', 'ticketType')
      .leftJoinAndSelect('ticketType.event', 'event')
      .leftJoinAndSelect('order.payments', 'payments')
      .orderBy('order.createdAt', 'DESC');

    if (filter?.status) {
      query.andWhere('order.status = :status', { status: filter.status });
    }

    if (filter?.customerId) {
      query.andWhere('order.customerId = :customerId', {
        customerId: filter.customerId,
      });
    }

    if (filter?.ticketTypeId) {
      query.andWhere('order.ticketTypeId = :ticketTypeId', {
        ticketTypeId: filter.ticketTypeId,
      });
    }

    if (filter?.eventId) {
      query.andWhere('ticketType.eventId = :eventId', {
        eventId: filter.eventId,
      });
    }

    return query.getMany();
  }

  /**
   * Find a specific order by ID with complete relations.
   * @param id - UUID of the order.
   * @returns Detailed order entity.
   * @throws NotFoundException if not found.
   */
  async findOne(id: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['ticketType', 'ticketType.event', 'payments'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${id}" was not found.`);
    }

    return order;
  }

  /**
   * Forcefully expire a pending order from the management console.
   * Restores the reserved ticket quantity back to the ticket type pool.
   * @param id - UUID of the order to expire.
   * @returns Expired order entity.
   * @throws BadRequestException if the order is not in PENDING state.
   */
  async forceExpire(id: string): Promise<Order> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await queryRunner.manager.findOne(Order, {
        where: { id },
        relations: ['ticketType'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new NotFoundException(`Order with ID "${id}" was not found.`);
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          `Cannot force-expire order with status "${order.status}". Only PENDING orders can be expired.`,
        );
      }

      order.status = OrderStatus.EXPIRED;
      await queryRunner.manager.save(order);

      // Restore ticket inventory
      if (order.ticketType) {
        order.ticketType.remainingQuantity += order.quantity;
        await queryRunner.manager.save(order.ticketType);
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Order ${order.id} was forcefully expired by management.`);
      return order;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Cancel an order from management.
   * Restores inventory if the order was PENDING or PAID.
   * @param id - UUID of the order to cancel.
   * @returns Cancelled order entity.
   * @throws BadRequestException if order is already cancelled or expired.
   */
  async cancelOrder(id: string): Promise<Order> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await queryRunner.manager.findOne(Order, {
        where: { id },
        relations: ['ticketType'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new NotFoundException(`Order with ID "${id}" was not found.`);
      }

      if (
        order.status === OrderStatus.CANCELLED ||
        order.status === OrderStatus.EXPIRED
      ) {
        throw new BadRequestException(
          `Order is already marked as "${order.status}".`,
        );
      }

      const shouldRestoreInventory =
        order.status === OrderStatus.PENDING || order.status === OrderStatus.PAID;

      order.status = OrderStatus.CANCELLED;
      await queryRunner.manager.save(order);

      if (shouldRestoreInventory && order.ticketType) {
        order.ticketType.remainingQuantity += order.quantity;
        await queryRunner.manager.save(order.ticketType);
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Order ${order.id} was cancelled by management.`);
      return order;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Periodic expiry job execution method.
   * Finds all PENDING orders past their expiresAt deadline, marks them EXPIRED,
   * and replenishes the respective ticket quantities.
   * @returns Number of orders successfully expired.
   */
  async expireOverdueOrders(): Promise<number> {
    const now = new Date();
    const overdueOrders = await this.orderRepository.find({
      where: {
        status: OrderStatus.PENDING,
        expiresAt: LessThan(now),
      },
      relations: ['ticketType'],
    });

    if (overdueOrders.length === 0) {
      return 0;
    }

    let expiredCount = 0;

    for (const order of overdueOrders) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const lockedOrder = await queryRunner.manager.findOne(Order, {
          where: { id: order.id },
          relations: ['ticketType'],
          lock: { mode: 'pessimistic_write' },
        });

        if (lockedOrder && lockedOrder.status === OrderStatus.PENDING) {
          lockedOrder.status = OrderStatus.EXPIRED;
          await queryRunner.manager.save(lockedOrder);

          if (lockedOrder.ticketType) {
            lockedOrder.ticketType.remainingQuantity += lockedOrder.quantity;
            await queryRunner.manager.save(lockedOrder.ticketType);
          }

          await queryRunner.commitTransaction();
          expiredCount++;
          this.logger.log(
            `Automated expiry: Order ${lockedOrder.id} expired. Restored ${lockedOrder.quantity} tickets.`,
          );
        } else {
          await queryRunner.rollbackTransaction();
        }
      } catch (error) {
        await queryRunner.rollbackTransaction();
        this.logger.error(
          `Failed to automatically expire order ${order.id}: ${error.message}`,
          error.stack,
        );
      } finally {
        await queryRunner.release();
      }
    }

    return expiredCount;
  }
}
