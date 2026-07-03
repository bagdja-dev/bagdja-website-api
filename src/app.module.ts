import { BagdjaModule } from '@bagdja/node-sdk';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './common/auth';
import { HealthModule } from './modules/health/health.module';
import { WebsitesModule } from './modules/websites/websites.module';
import { StaffModule } from './modules/staff/staff.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

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
    AuthModule,
    HealthModule,
    WebsitesModule,
    StaffModule,
  ],
})
export class AppModule {}
