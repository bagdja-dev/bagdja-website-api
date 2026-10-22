import { BagdjaModule } from '@bagdja/node-sdk';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './common/auth';
import { AndroidAppsModule } from './modules/android-apps/android-apps.module';
import { DomainsModule } from './modules/domains/domains.module';
import { UserModule } from './modules/user/user.module';
import { HealthModule } from './modules/health/health.module';
import { WebsitesModule } from './modules/websites/websites.module';
import { StaffModule } from './modules/staff/staff.module';
import { PagesModule } from './modules/pages/pages.module';
import { SectionsModule } from './modules/sections/sections.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { ProductsModule } from './modules/products/products.module';
import { FulfillmentFlowsModule } from './modules/fulfillment-flows/fulfillment-flows.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { LocationsModule } from './modules/locations/locations.module';
import { FaqsModule } from './modules/faqs/faqs.module';
import { BlogPostsModule } from './modules/blog-posts/blog-posts.module';
import { PublicModule } from './modules/public/public.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { AssetsModule } from './modules/assets/assets.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { EscrowModule } from './modules/escrow/escrow.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { ChatModule } from './modules/chat/chat.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WebsiteEventBroadcasterModule } from './common/website-event-broadcaster/website-event-broadcaster.module';
import { GatheringModule } from './modules/gathering/gathering.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (redisUrl) {
          const parsed = new URL(redisUrl);
          const database = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined;
          return {
            connection: {
              host: parsed.hostname,
              port: Number(parsed.port) || (parsed.protocol === 'rediss:' ? 6380 : 6379),
              username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
              password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
              db: Number.isInteger(database) ? database : undefined,
              tls: parsed.protocol === 'rediss:' ? {} : undefined,
              maxRetriesPerRequest: null,
            },
          };
        }

        return {
          connection: {
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>(
          'DATABASE_URL',
          'postgresql://postgres:postgres@localhost:54342/postgres',
        );
        const isSupabase = databaseUrl.includes('supabase');

        return {
          type: 'postgres' as const,
          url: databaseUrl,
          autoLoadEntities: true,
          synchronize: false,
          logging: config.get<string>('NODE_ENV') === 'development',
          ssl: isSupabase ? { rejectUnauthorized: false } : false,
          extra: {
            max: 10,
            connectionTimeoutMillis: 30000,
            idleTimeoutMillis: 30000,
          },
        };
      },
    }),

    BagdjaModule.register({
      isGlobal: true,
      auth: {
        authServiceUrl:
          process.env.BAGDJA_AUTH_API ||
          process.env.BAGDJA_AUTH_URL ||
          'http://localhost:4001',
        jwksUrl: process.env.JWKS_URL,
      },
      logger: {
        logServiceUrl:
          process.env.BAGDJA_LOG_URL ||
          process.env.LOG_SERVICE_URL ||
          'http://localhost:4087',
        serviceName: process.env.BAGDJA_SERVICE_NAME || 'bagdja-website-api',
        clientId: process.env.CLIENT_APP_ID,
        clientSecret: process.env.CLIENT_APP_SECRET,
      },
    }),

    DatabaseModule,
    WebsiteEventBroadcasterModule,
    UserModule,
    AuthModule,
    HealthModule,
    WebsitesModule,
    DomainsModule,
    StaffModule,
    PagesModule,
    SectionsModule,
    TemplatesModule,
    ProductsModule,
    FulfillmentFlowsModule,
    CategoriesModule,
    LocationsModule,
    FaqsModule,
    BlogPostsModule,
    PublicModule,
    UploadsModule,
    AssetsModule,
    MessagingModule,
    WalletModule,
    SubscriptionsModule,
    EscrowModule,
    OrdersModule,
    TransactionsModule,
    ShippingModule,
    VendorsModule,
    ChatModule,
    NotificationsModule,
    GatheringModule,
    AndroidAppsModule,
  ],
})
export class AppModule {}
