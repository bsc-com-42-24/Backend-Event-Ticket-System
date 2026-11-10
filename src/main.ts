import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { uploadDir } from './events/event-images.controller';
import { writeFileSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const allowedOrigins = process.env.FRONTEND_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors(
    allowedOrigins?.length ? { origin: allowedOrigins } : undefined,
  );

  // uploaded event images are served from /uploads
  app.useStaticAssets(uploadDir(), { prefix: '/uploads/' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Ticket Master API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  
  //Generate Swagger documentation
  const swaggerDocument = SwaggerModule.createDocument(
    app,
    swaggerConfig,
  );

  //EXPORT documentation to JSON
  writeFileSync(
    './swagger.json',
    JSON.stringify(swaggerDocument, null, 2),
  );

  // Set up Swagger UI
  SwaggerModule.setup('api', app,swaggerDocument
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
