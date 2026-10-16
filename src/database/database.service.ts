import {
  Injectable,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    this.pool = new Pool({
      host: this.config.get<string>('DB_HOST', 'localhost'),
      port: Number(this.config.get<string>('DB_PORT', '5432')),
      user: this.config.get<string>('DB_USER'),
      password: this.config.get<string>('DB_PASSWORD'),
      database: this.config.get<string>('DB_NAME'),
      max: 10,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (error) => {
      this.logger.error(
        'Unexpected PostgreSQL pool error',
        error.message,
      );
    });
  }

  async query(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult> {
    return this.pool.query(sql, params);
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}