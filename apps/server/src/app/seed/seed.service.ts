import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Action, Resource, UserStatus, UserType, type EnvTypes } from '@app/shared';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { ADMIN_GRANTS, PROCUREMENT_GRANTS } from '../auth/auth.module';
import { ProductEntity } from '../catalog/entities/product.entity';
import { RolePermissionEntity } from '../role/entities/role-permission.entity';
import { RoleEntity } from '../role/entities/role.entity';
import { UserRoleEntity } from '../role/entities/user-role.entity';
import { UserEntity } from '../user/entities/user.entity';

const CATALOG: Array<Partial<ProductEntity> & { quantity: number; minStock: number }> = [
  {
    slug: 'arduino-uno-r3',
    name: 'Arduino Uno R3',
    subtitle: 'ATmega328P, 16MHz, 14 Digital I/O',
    category: 'Microcontrollers',
    brand: 'Arduino',
    subcategory: 'Arduino Uno R3',
    price: 8500,
    sku: 'ARD-UNO-R3',
    quantity: 48,
    minStock: 8,
    image: '/images/auth-panel.png',
    images: ['/images/auth-panel.png', '/images/auth-signin-panel.png'],
    specs: [
      { label: 'Microcontroller', value: 'ATmega328P' },
      { label: 'Operating Voltage', value: '5V' },
    ],
  },
  {
    slug: 'raspberry-pi-4-model-b',
    name: 'Raspberry Pi 4 Model B',
    subtitle: '8GB RAM, Quad-core ARM Cortex-A72',
    category: 'Microcontrollers',
    brand: 'Raspberry Pi',
    subcategory: 'Single Board Computers',
    price: 45000,
    sku: 'RPI-4B-8G',
    isNew: true,
    quantity: 23,
    minStock: 5,
    image: '/images/auth-signin-panel.png',
    images: ['/images/auth-signin-panel.png'],
    specs: [{ label: 'RAM', value: '8GB LPDDR4-3200 SDRAM' }],
  },
  {
    slug: '12v-5a-power-supply',
    name: '12V 5A Power Supply',
    subtitle: 'Regulated switching PSU for electronics projects',
    category: 'Power Supply',
    brand: 'Adafruit',
    subcategory: 'Power Adapters',
    price: 6200,
    sku: 'PSU-12V-5A',
    quantity: 120,
    minStock: 20,
    image: '/images/auth-panel.png',
    images: ['/images/auth-panel.png'],
    specs: [{ label: 'Output', value: '12V DC 5A' }],
  },
  {
    slug: 'dht22-temp-humidity',
    name: 'DHT22 Temp & Humidity',
    subtitle: 'Digital temperature and humidity sensor',
    category: 'Sensors',
    brand: 'Adafruit',
    subcategory: 'Environmental',
    price: 4800,
    sku: 'SEN-DHT22',
    quantity: 4,
    minStock: 10,
    image: '/images/auth-signin-panel.png',
    images: ['/images/auth-signin-panel.png'],
    specs: [{ label: 'Interface', value: 'Single-wire digital' }],
  },
  {
    slug: 'oled-128x64-display',
    name: 'OLED 128×64 Display',
    subtitle: '0.96 inch I2C monochrome OLED',
    category: 'Displays',
    brand: 'SparkFun',
    subcategory: 'OLED',
    price: 3500,
    sku: 'DSP-OLED-096',
    quantity: 67,
    minStock: 10,
    image: '/images/auth-panel.png',
    images: ['/images/auth-panel.png'],
    specs: [{ label: 'Resolution', value: '128 × 64' }],
  },
  {
    slug: 'arduino-nano',
    name: 'Arduino Nano',
    subtitle: 'Compact ATmega328 board',
    category: 'Microcontrollers',
    brand: 'Arduino',
    subcategory: 'Arduino Nano',
    price: 7200,
    sku: 'ARD-NANO',
    isNew: true,
    quantity: 35,
    minStock: 8,
    image: '/images/auth-signin-panel.png',
    images: ['/images/auth-signin-panel.png'],
    specs: [{ label: 'Microcontroller', value: 'ATmega328' }],
  },
];

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(RoleEntity) private readonly roles: Repository<RoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly grants: Repository<RolePermissionEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly assignments: Repository<UserRoleEntity>,
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
    private readonly config: ConfigService<EnvTypes, true>,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get('nodeEnv', { infer: true }) === 'production') return;
    await this.seedRoles();
    await this.seedUsers();
    await this.seedCatalog();
  }

  private async seedRoles() {
    await this.ensureRole('procurement', 'Procurement Buyer', PROCUREMENT_GRANTS);
    await this.ensureRole('super_admin', 'Super Admin', [
      ...ADMIN_GRANTS,
      { action: Action.MANAGE, resource: Resource.ALL },
    ]);
  }

  private async ensureRole(
    slug: string,
    name: string,
    grants: Array<{ action: Action; resource: Resource }>,
  ) {
    let role = await this.roles.findOne({ where: { slug } });
    if (!role) role = await this.roles.save(this.roles.create({ slug, name }));
    const existing = await this.grants.find({ where: { roleId: role.id } });
    if (existing.length > 0) return role;
    await this.grants.save(
      grants.map((grant) =>
        this.grants.create({ roleId: role!.id, ...grant }),
      ),
    );
    return role;
  }

  private async seedUsers() {
    const password = this.config.get('seed.password', { infer: true });
    const hash = await bcrypt.hash(
      password,
      this.config.get('auth.saltRounds', { infer: true }),
    );
    await this.ensureUser({
      email: this.config.get('seed.buyerEmail', { infer: true }),
      firstName: 'Bayonuga',
      lastName: 'Bello',
      type: UserType.PROCUREMENT,
      roleSlug: 'procurement',
      passwordHash: hash,
    });
    await this.ensureUser({
      email: this.config.get('seed.adminEmail', { infer: true }),
      firstName: 'Admin',
      lastName: 'User',
      type: UserType.ADMIN,
      roleSlug: 'super_admin',
      passwordHash: hash,
    });
    this.logger.log(`Seed users ready. Password: ${password}`);
  }

  private async ensureUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    type: UserType;
    roleSlug: string;
    passwordHash: string;
  }) {
    let user = await this.users.findOne({ where: { email: input.email } });
    if (!user) {
      user = await this.users.save(
        this.users.create({
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          type: input.type,
          status: UserStatus.ACTIVE,
          emailVerified: true,
          passwordHash: input.passwordHash,
          companyName: 'Regalia Electrical',
        }),
      );
    }
    const role = await this.roles.findOne({ where: { slug: input.roleSlug } });
    if (!role) return;
    const linked = await this.assignments.findOne({
      where: { userId: user.id, roleId: role.id },
    });
    if (!linked) {
      await this.assignments.save(
        this.assignments.create({ userId: user.id, roleId: role.id }),
      );
    }
  }

  private async seedCatalog() {
    for (const item of CATALOG) {
      const exists = await this.products.findOne({ where: { slug: item.slug } });
      if (exists) continue;
      await this.products.save(
        this.products.create({
          ...item,
          highlights: [
            { label: 'Verified Inventory', icon: 'verified' },
            { label: 'Technical Support available', icon: 'support' },
          ],
          datasheetNote: 'Datasheet available on request.',
          reviewsNote: 'Reviews will appear after verified purchases.',
          inventory: {
            quantity: item.quantity,
            minStock: item.minStock,
          },
        }),
      );
    }
  }
}
