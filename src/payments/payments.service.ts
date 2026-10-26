import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { TicketType } from '../ticket-types/entities/ticket-type.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';

/**
 * Service managing payment operations, settlement confirmations, and refund handling.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Record an incoming payment transaction attempt for an order.
   * @param dto - Payment initialization details.
   * @returns Newly created payment record.
   * @throws NotFoundException if order does not exist.
   * @throws BadRequestException if the order cannot receive payments.
   */
  async createPayment(dto: CreatePaymentDto): Promise<Payment> {
    const order = await this.orderRepository.findOne({
      where: { id: dto.orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${dto.orderId}" not found.`);
    }

    if (
      order.status === OrderStatus.EXPIRED ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot accept payment for an order with status "${order.status}".`,
      );
    }

    const payment = this.paymentRepository.create({
      ...dto,
      status: PaymentStatus.PENDING,
    });

    return this.paymentRepository.save(payment);
  }

  /**
   * Confirm that an order payment has cleared and update order status accordingly.
   * When total confirmed payments reach or exceed the order total amount, the order is marked PAID.
   * @param id - UUID of the payment record.
   * @param dto - Optional confirmation transaction reference.
   * @returns Confirmed payment entity.
   */
  async confirmPayment(
    id: string,
    dto: ConfirmPaymentDto,
  ): Promise<Payment> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const payment = await queryRunner.manager.findOne(Payment, {
        where: { id },
        relations: ['order'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!payment) {
        throw new NotFoundException(`Payment with ID "${id}" was not found.`);
      }

      if (payment.status === PaymentStatus.CONFIRMED) {
        throw new BadRequestException('This payment has already been confirmed.');
      }

      const order = await queryRunner.manager.findOne(Order, {
        where: { id: payment.orderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new NotFoundException(
          `Associated order "${payment.orderId}" not found.`,
        );
      }

      if (
        order.status === OrderStatus.EXPIRED ||
        order.status === OrderStatus.CANCELLED
      ) {
        throw new BadRequestException(
          `Cannot confirm payment because the associated order is "${order.status}".`,
        );
      }

      payment.status = PaymentStatus.CONFIRMED;
      payment.processedAt = new Date();
      if (dto.transactionReference) {
        payment.transactionReference = dto.transactionReference;
      }

      const savedPayment = await queryRunner.manager.save(payment);

      // Evaluate order paid threshold
      const existingPayments = await queryRunner.manager.find(Payment, {
        where: {
          orderId: order.id,
          status: PaymentStatus.CONFIRMED,
        },
      });

      const totalPaid = existingPayments.reduce(
        (acc, p) => acc + Number(p.amount),
        0,
      );

      if (totalPaid >= Number(order.totalAmount)) {
        order.status = OrderStatus.PAID;
        await queryRunner.manager.save(order);
        this.logger.log(
          `Order ${order.id} is now fully PAID (Total: ${totalPaid}/${order.totalAmount}).`,
        );
      }

      await queryRunner.commitTransaction();
      return savedPayment;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Mark an existing payment attempt as FAILED.
   * @param id - UUID of the payment record.
   * @returns Updated payment entity.
   */
  async markFailed(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({ where: { id } });

    if (!payment) {
      throw new NotFoundException(`Payment with ID "${id}" was not found.`);
    }

    if (payment.status === PaymentStatus.CONFIRMED) {
      throw new BadRequestException('Cannot mark a confirmed payment as failed.');
    }

    payment.status = PaymentStatus.FAILED;
    payment.processedAt = new Date();

    return this.paymentRepository.save(payment);
  }

  /**
   * Process a refund for a confirmed payment and return inventory back to the ticket pool.
   * @param id - UUID of the payment.
   * @param dto - Refund notes and external reference ID.
   * @returns Refunded payment entity.
   */
  async refundPayment(
    id: string,
    dto: RefundPaymentDto,
  ): Promise<Payment> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const payment = await queryRunner.manager.findOne(Payment, {
        where: { id },
        relations: ['order', 'order.ticketType'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!payment) {
        throw new NotFoundException(`Payment with ID "${id}" was not found.`);
      }

      if (payment.status !== PaymentStatus.CONFIRMED) {
        throw new BadRequestException(
          `Only CONFIRMED payments can be refunded. Current status: "${payment.status}".`,
        );
      }

      payment.status = PaymentStatus.REFUNDED;
      payment.processedAt = new Date();
      if (dto.transactionReference) {
        payment.transactionReference = dto.transactionReference;
      }

      const savedPayment = await queryRunner.manager.save(payment);

      // Update associated order status
      const order = payment.order;
      if (order) {
        order.status = OrderStatus.REFUNDED;
        await queryRunner.manager.save(order);

        // Replenish stock
        if (order.ticketType) {
          order.ticketType.remainingQuantity += order.quantity;
          await queryRunner.manager.save(order.ticketType);
        }
      }

      await queryRunner.commitTransaction();
      this.logger.log(
        `Payment ${payment.id} refunded. Order ${order?.id} status marked REFUNDED and tickets replenished.`,
      );
      return savedPayment;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Retrieve all payments made against a specific order.
   * @param orderId - UUID of the order.
   * @returns Array of payments.
   */
  async findByOrder(orderId: string): Promise<Payment[]> {
    return this.paymentRepository.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Retrieve all payments associated with an entire event.
   * Queries through order -> ticketType -> eventId.
   * @param eventId - UUID of the event.
   * @returns Array of payments with order and ticket type details.
   */
  async findByEvent(eventId: string): Promise<Payment[]> {
    return this.paymentRepository
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.order', 'order')
      .innerJoinAndSelect('order.ticketType', 'ticketType')
      .where('ticketType.eventId = :eventId', { eventId })
      .orderBy('payment.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Retrieve a single payment record by ID.
   * @param id - UUID of payment.
   * @returns Payment entity.
   */
  async findOne(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      relations: ['order'],
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID "${id}" was not found.`);
    }

    return payment;
  }
}
