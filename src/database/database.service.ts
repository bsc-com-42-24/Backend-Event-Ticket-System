import 'dotenv/config';
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, PoolClient, QueryResult } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      user: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'ticket_master',
      max: 10,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (error) => {
      this.logger.error('Unexpected PostgreSQL pool error', error.message);
    });
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    return this.pool.query(sql, params);
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}