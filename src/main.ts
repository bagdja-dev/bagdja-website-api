import 'reflect-metadata';
import 'dotenv/config';
import { setDefaultResultOrder } from 'node:dns';

// Node.js v25 prefers IPv6 by default; Supabase direct connection
// often only accepts IPv4 — force IPv4-first to prevent ECONNREFUSED.
setDefaultResultOrder('ipv4first');

import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as basicAuth from 'express-basic-auth';

import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('BagdjaWebsiteApi');
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerUser = String(config.get('SWAGGER_USER') ?? '').trim();
  const swaggerPass = String(config.get('SWAGGER_PASSWORD') ?? '').trim();
  if (swaggerUser && swaggerPass) {
    app.use(
      ['/docs', '/docs-json'],
      basicAuth({
        users: { [swaggerUser]: swaggerPass },
        challenge: true,
        realm: 'Bagdja Website API Docs',
      }),
    );
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Bagdja Website API')
    .setDescription(
      'Multi-tenant SaaS untuk UMKM. Mengelola website, halaman, section, template, dan staff per-tenant.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-api-token', in: 'header' }, 'x-api-token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = Number(config.get('PORT') ?? 5003);
  await app.listen(port);

  logger.log(`Bagdja Website API listening on ${await app.getUrl()}`);
  logger.log(`Swagger docs: ${await app.getUrl()}/docs`);
}

void bootstrap();
