import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

/**
 * Scheduled cron job responsible for detecting and expiring overdue ticket orders.
 */
@Injectable()
export class OrdersScheduler {
  private readonly logger = new Logger(OrdersScheduler.name);

  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Cron runner executing every minute to transition unpaid expired orders
   * to EXPIRED state and replenish reserved ticket quantities.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleOrderExpiryCron(): Promise<void> {
    this.logger.debug('Running scheduled check for expired orders...');
    try {
      const expiredCount = await this.ordersService.expireOverdueOrders();
      if (expiredCount > 0) {
        this.logger.log(
          `Cron completed: Expired ${expiredCount} unpaid orders and restored ticket inventory.`,
        );
      }
    } catch (error) {
      this.logger.error('Error occurred during order expiry cron job', error.stack);
    }
  }
}
