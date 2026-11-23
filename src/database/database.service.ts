import 'dotenv/config';
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, PoolClient, QueryResult } from 'pg';

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in the environment`);
  }
  return value;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: requiredEnvironmentVariable('DB_HOST'),
      port: Number(process.env.DB_PORT ?? 5432),
      user: requiredEnvironmentVariable('DB_USERNAME'),
      password: requiredEnvironmentVariable('DB_PASSWORD'),
      database: requiredEnvironmentVariable('DB_NAME'),
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
