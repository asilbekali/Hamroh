import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

const SALT_ROUNDS = 10;

/**
 * Guarantees the database always has one default super admin.
 * Its phone number (used as the login) and password come from the environment,
 * so a fresh deployment is reachable right after the first boot.
 */
@Injectable()
export class SuperAdminSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperAdminSeeder.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const phone = this.config.get<string>('SUPER_ADMIN_PHONE')?.trim();
    const password = this.config.get<string>('SUPER_ADMIN_PASSWORD');

    if (!phone || !password) {
      this.logger.warn(
        'SUPER_ADMIN_PHONE / SUPER_ADMIN_PASSWORD are not set — default super admin was not created',
      );
      return;
    }

    const existing = await this.prisma.user.findUnique({
      where: { username: phone },
      select: { id: true, role: true, isActive: true },
    });

    if (existing) {
      // Keep the account usable even if it was demoted or deactivated by hand.
      if (existing.role !== Role.SUPER_ADMIN || !existing.isActive) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { role: Role.SUPER_ADMIN, isActive: true },
        });
        this.logger.log(`Default super admin restored: ${phone}`);
      }
      return;
    }

    await this.prisma.user.create({
      data: {
        username: phone,
        phone,
        password: await bcrypt.hash(password, SALT_ROUNDS),
        fullName:
          this.config.get<string>('SUPER_ADMIN_FULL_NAME') ??
          'Bosh administrator',
        role: Role.SUPER_ADMIN,
      },
    });

    this.logger.log(`Default super admin created: ${phone}`);
  }
}
