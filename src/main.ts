import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global Input Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Enable CORS for frontend management dashboards
  app.enableCors();

  // Swagger OpenAPI Documentation Configuration
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Ticket Event Management API')
    .setDescription(
      'Administrative and management backend API for Ticket Event Management System. ' +
        'Provides endpoints for event curation, ticket tier allocation, order lifecycle tracking, ' +
        'unpaid order expiry scheduling, and payment management.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('Events Management', 'Operations for managing and publishing events')
    .addTag(
      'Ticket Types Management',
      'Operations for managing ticket tiers and inventory',
    )
    .addTag(
      'Orders Management',
      'Operations for tracking, cancelling, and expiring orders',
    )
    .addTag(
      'Payments Management',
      'Operations for recording, confirming, failing, and refunding payments',
    )
    .addTag('Health', 'Operational health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Ticket Event System - Management API Docs',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`Server listening on http://localhost:${port}`);
  logger.log(`Swagger documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();