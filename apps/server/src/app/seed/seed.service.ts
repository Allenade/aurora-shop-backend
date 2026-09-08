import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Action,
  Resource,
  UserStatus,
  UserType,
  type EnvTypes,
} from '@app/shared';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { ADMIN_GRANTS, PROCUREMENT_GRANTS } from '../auth/auth.module';
import { ProductEntity } from '../catalog/entities/product.entity';
import {
  OrderEntity,
  type OrderStatus,
  type PaymentStatus,
} from '../order/entities/order.entity';
import {
  QuoteEntity,
  type QuoteStatus,
} from '../procurement/entities/quote.entity';
import { RolePermissionEntity } from '../role/entities/role-permission.entity';
import { RoleEntity } from '../role/entities/role.entity';
import { UserRoleEntity } from '../role/entities/user-role.entity';
import { UserEntity } from '../user/entities/user.entity';

const CATALOG: Array<
  Partial<ProductEntity> & { quantity: number; minStock: number }
> = [
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
  {
    slug: 'esp32-devkit-v1',
    name: 'ESP32 DevKit V1',
    subtitle: 'Wi-Fi + Bluetooth dual-core MCU',
    category: 'Microcontrollers',
    brand: 'Espressif',
    subcategory: 'ESP32',
    price: 9500,
    sku: 'ESP-32-DEVKIT',
    isNew: true,
    quantity: 62,
    minStock: 12,
    image: '/images/auth-panel.png',
    images: ['/images/auth-panel.png'],
    specs: [
      { label: 'Connectivity', value: 'Wi-Fi 802.11 b/g/n + Bluetooth' },
      { label: 'Cores', value: 'Dual-core LX6' },
    ],
  },
  {
    slug: 'nema-17-stepper-motor',
    name: 'NEMA 17 Stepper Motor',
    subtitle: '1.8° step angle, 40N·cm holding torque',
    category: 'Motors',
    brand: 'SparkFun',
    subcategory: 'Stepper Motors',
    price: 7800,
    sku: 'MTR-NEMA17',
    quantity: 28,
    minStock: 8,
    image: '/images/auth-signin-panel.png',
    images: ['/images/auth-signin-panel.png'],
    specs: [
      { label: 'Step Angle', value: '1.8°' },
      { label: 'Rated Current', value: '1.5A' },
    ],
  },
  {
    slug: 'hc-sr04-ultrasonic',
    name: 'HC-SR04 Ultrasonic Sensor',
    subtitle: '2cm–400cm distance ranging module',
    category: 'Sensors',
    brand: 'Generic',
    subcategory: 'Distance',
    price: 1800,
    sku: 'SEN-HCSR04',
    quantity: 2,
    minStock: 15,
    image: '/images/auth-panel.png',
    images: ['/images/auth-panel.png'],
    specs: [{ label: 'Range', value: '2cm – 400cm' }],
  },
  {
    slug: 'breadboard-830',
    name: 'Breadboard 830 Points',
    subtitle: 'Solderless prototyping board',
    category: 'Powers',
    brand: 'Generic',
    subcategory: 'Prototyping',
    price: 2500,
    sku: 'BRD-830',
    quantity: 95,
    minStock: 20,
    image: '/images/auth-signin-panel.png',
    images: ['/images/auth-signin-panel.png'],
    specs: [{ label: 'Tie Points', value: '830' }],
  },
];


const DUMMY_BUYERS: Array<{
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  phone: string;
  state: string;
  industry: string;
}> = [
  {
    email: 'chioma.okafor@example.com',
    firstName: 'Chioma',
    lastName: 'Okafor',
    companyName: 'Lagos Tech Labs',
    phone: '+2348011001001',
    state: 'Lagos',
    industry: 'Electronics',
  },
  {
    email: 'ibrahim.musa@example.com',
    firstName: 'Ibrahim',
    lastName: 'Musa',
    companyName: 'Kano Automation',
    phone: '+2348011001002',
    state: 'Kano',
    industry: 'Manufacturing',
  },
  {
    email: 'adesuwa.eze@example.com',
    firstName: 'Adesuwa',
    lastName: 'Eze',
    companyName: 'Benin Maker Hub',
    phone: '+2348011001003',
    state: 'Edo',
    industry: 'Education',
  },
  {
    email: 'tunde.balogun@example.com',
    firstName: 'Tunde',
    lastName: 'Balogun',
    companyName: 'Ibadan Robotics Club',
    phone: '+2348011001004',
    state: 'Oyo',
    industry: 'Education',
  },
  {
    email: 'fatima.abdullahi@example.com',
    firstName: 'Fatima',
    lastName: 'Abdullahi',
    companyName: 'Abuja Smart Systems',
    phone: '+2348011001005',
    state: 'FCT',
    industry: 'Government',
  },
  {
    email: 'chinedu.okeke@example.com',
    firstName: 'Chinedu',
    lastName: 'Okeke',
    companyName: 'Enugu Power Works',
    phone: '+2348011001006',
    state: 'Enugu',
    industry: 'Energy',
  },
  {
    email: 'amaka.nwosu@example.com',
    firstName: 'Amaka',
    lastName: 'Nwosu',
    companyName: 'Port Harcourt Fab Lab',
    phone: '+2348011001007',
    state: 'Rivers',
    industry: 'Research',
  },
  {
    email: 'yusuf.bello@example.com',
    firstName: 'Yusuf',
    lastName: 'Bello',
    companyName: 'Kaduna Circuits NG',
    phone: '+2348011001008',
    state: 'Kaduna',
    industry: 'Electronics',
  },
  {
    email: 'funke.adebayo@example.com',
    firstName: 'Funke',
    lastName: 'Adebayo',
    companyName: 'Abeokuta Prototypes',
    phone: '+2348011001009',
    state: 'Ogun',
    industry: 'Manufacturing',
  },
  {
    email: 'emeka.obi@example.com',
    firstName: 'Emeka',
    lastName: 'Obi',
    companyName: 'Onitsha Component Store',
    phone: '+2348011001010',
    state: 'Anambra',
    industry: 'Retail',
  },
];

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly grants: Repository<RolePermissionEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly assignments: Repository<UserRoleEntity>,
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(QuoteEntity)
    private readonly quotes: Repository<QuoteEntity>,
    private readonly config: ConfigService<EnvTypes, true>,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get('nodeEnv', { infer: true }) === 'production') return;
    await this.seedRoles();
    await this.seedUsers();
    await this.seedCatalog();
    await this.seedOrders();
    await this.seedQuotes();
  }

  private async seedRoles() {
    await this.ensureRole(
      'procurement',
      'Procurement Buyer',
      PROCUREMENT_GRANTS,
    );
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
      grants.map((grant) => this.grants.create({ roleId: role.id, ...grant })),
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
      companyName: 'Regalia Electrical',
      phone: '+2348090000001',
      state: 'Lagos',
      industry: 'Electronics',
    });
    await this.ensureUser({
      email: this.config.get('seed.adminEmail', { infer: true }),
      firstName: 'Admin',
      lastName: 'User',
      type: UserType.ADMIN,
      roleSlug: 'super_admin',
      passwordHash: hash,
      companyName: 'Regalia Electrical',
    });
    for (const buyer of DUMMY_BUYERS) {
      await this.ensureUser({
        email: buyer.email,
        firstName: buyer.firstName,
        lastName: buyer.lastName,
        type: UserType.PROCUREMENT,
        roleSlug: 'procurement',
        passwordHash: hash,
        companyName: buyer.companyName,
        phone: buyer.phone,
        state: buyer.state,
        industry: buyer.industry,
      });
    }
    this.logger.log(
      `Seed users ready (${DUMMY_BUYERS.length} dummy buyers). Password: ${password}`,
    );
  }

  private async ensureUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    type: UserType;
    roleSlug: string;
    passwordHash: string;
    companyName?: string;
    phone?: string;
    state?: string;
    industry?: string;
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
          companyName: input.companyName ?? 'Regalia Electrical',
          phone: input.phone,
          state: input.state,
          industry: input.industry,
        }),
      );
    }
    const role = await this.roles.findOne({ where: { slug: input.roleSlug } });
    if (!role) return user;
    const linked = await this.assignments.findOne({
      where: { userId: user.id, roleId: role.id },
    });
    if (!linked) {
      await this.assignments.save(
        this.assignments.create({ userId: user.id, roleId: role.id }),
      );
    }
    return user;
  }

  private async seedCatalog() {
    for (const item of CATALOG) {
      const exists = await this.products.findOne({
        where: { slug: item.slug },
      });
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

  private async seedOrders() {
    const products = await this.products.find({
      relations: { inventory: true },
      order: { createdAt: 'ASC' },
    });
    if (products.length === 0) return;

    const buyers = await this.users.find({
      where: { type: UserType.PROCUREMENT },
      order: { createdAt: 'ASC' },
    });
    if (buyers.length === 0) return;

    const baskets: Array<Array<{ slug: string; qty: number }>> = [
      [
        { slug: 'arduino-uno-r3', qty: 2 },
        { slug: 'breadboard-830', qty: 1 },
      ],
      [
        { slug: 'esp32-devkit-v1', qty: 1 },
        { slug: 'oled-128x64-display', qty: 2 },
      ],
      [
        { slug: 'raspberry-pi-4-model-b', qty: 1 },
        { slug: '12v-5a-power-supply', qty: 1 },
      ],
      [
        { slug: 'nema-17-stepper-motor', qty: 2 },
        { slug: 'arduino-nano', qty: 1 },
      ],
      [{ slug: 'dht22-temp-humidity', qty: 1 }],
      [
        { slug: 'hc-sr04-ultrasonic', qty: 1 },
        { slug: 'breadboard-830', qty: 2 },
      ],
      [
        { slug: 'arduino-uno-r3', qty: 1 },
        { slug: 'esp32-devkit-v1', qty: 1 },
        { slug: 'oled-128x64-display', qty: 1 },
      ],
      [{ slug: '12v-5a-power-supply', qty: 3 }],
      [
        { slug: 'raspberry-pi-4-model-b', qty: 1 },
        { slug: 'nema-17-stepper-motor', qty: 1 },
      ],
      [
        { slug: 'arduino-nano', qty: 2 },
        { slug: 'dht22-temp-humidity', qty: 1 },
      ],
    ];

    const fulfillment: Array<{
      status: OrderStatus;
      paymentStatus: PaymentStatus;
      paymentMethod: 'bank' | 'card';
      deliveryMethod: 'standard' | 'express';
    }> = [
      {
        status: 'delivered',
        paymentStatus: 'paid',
        paymentMethod: 'bank',
        deliveryMethod: 'standard',
      },
      {
        status: 'in_transit',
        paymentStatus: 'paid',
        paymentMethod: 'card',
        deliveryMethod: 'express',
      },
      {
        status: 'pending',
        paymentStatus: 'unpaid',
        paymentMethod: 'bank',
        deliveryMethod: 'standard',
      },
      {
        status: 'delivered',
        paymentStatus: 'paid',
        paymentMethod: 'card',
        deliveryMethod: 'standard',
      },
      {
        status: 'in_transit',
        paymentStatus: 'paid',
        paymentMethod: 'bank',
        deliveryMethod: 'express',
      },
    ];

    const bySlug = new Map(products.map((product) => [product.slug, product]));
    let created = 0;

    for (let i = 0; i < buyers.length; i += 1) {
      const buyer = buyers[i]!;
      const orderCount = (i % 3) + 1;
      for (let n = 0; n < orderCount; n += 1) {
        const idempotencyKey = `seed-order-${buyer.email}-${n + 1}`;
        const existing = await this.orders.findOne({
          where: { idempotencyKey },
        });
        if (existing) continue;

        const basket = baskets[(i + n) % baskets.length]!;
        const lines = basket
          .map((entry) => {
            const product = bySlug.get(entry.slug);
            if (!product) return null;
            return {
              productId: product.id,
              slug: product.slug,
              name: product.name,
              sku: product.sku,
              qty: entry.qty,
              unitPrice: product.price,
              image: product.image,
            };
          })
          .filter(Boolean) as Array<{
          productId: string;
          slug: string;
          name: string;
          sku: string;
          qty: number;
          unitPrice: number;
          image: string;
        }>;
        if (lines.length === 0) continue;

        const meta = fulfillment[(i + n) % fulfillment.length]!;
        const subtotal = lines.reduce(
          (sum, line) => sum + line.unitPrice * line.qty,
          0,
        );
        const shipping = meta.deliveryMethod === 'express' ? 5500 : 2500;
        const tax = Math.round(subtotal * 0.075);
        const total = subtotal + shipping + tax;
        const year = new Date().getFullYear();
        const seq = 100 + ((i * 3 + n) % 800);

        await this.orders.save(
          this.orders.create({
            orderNumber: `ORD-${year}-${seq}`,
            userId: buyer.id,
            status: meta.status,
            paymentStatus: meta.paymentStatus,
            paymentMethod: meta.paymentMethod,
            trackingNumber: `TRK-${200000 + i * 10 + n}`,
            transactionReference:
              meta.paymentStatus === 'paid'
                ? `SEED-TXN-${i + 1}-${n + 1}`
                : undefined,
            subtotal,
            shipping,
            tax,
            total,
            deliveryMethod: meta.deliveryMethod,
            shippingName: `${buyer.firstName} ${buyer.lastName}`.trim(),
            shippingEmail: buyer.email,
            shippingPhone: buyer.phone ?? '+2348000000000',
            shippingAddress: `${buyer.state ?? 'Lagos'}, Nigeria`,
            idempotencyKey,
            items: lines,
            timeline: [
              {
                id: 'placed',
                label: 'Order placed',
                at: new Date().toISOString(),
                status: 'done',
              },
              {
                id: 'payment',
                label:
                  meta.paymentStatus === 'paid' ? 'Payment confirmed' : 'Awaiting payment',
                at: new Date().toISOString(),
                status: meta.paymentStatus === 'paid' ? 'done' : 'current',
              },
              {
                id: 'fulfillment',
                label:
                  meta.status === 'delivered'
                    ? 'Delivered'
                    : meta.status === 'in_transit'
                      ? 'In transit'
                      : 'Processing',
                at: new Date().toISOString(),
                status:
                  meta.status === 'pending'
                    ? 'upcoming'
                    : meta.status === 'delivered'
                      ? 'done'
                      : 'current',
              },
            ],
          }),
        );
        created += 1;
      }
    }

    if (created > 0) {
      this.logger.log(`Seeded ${created} demo orders for buyers.`);
    }
  }

  private async seedQuotes() {
    const buyers = await this.users.find({
      where: { type: UserType.PROCUREMENT },
      order: { createdAt: 'ASC' },
    });
    if (buyers.length === 0) return;

    const year = new Date().getFullYear();
    const samples: Array<{
      status: QuoteStatus;
      companyName: string;
      contactPerson: string;
      email: string;
      phone: string;
      components: string;
      quantity: string;
      budget: string;
      deliveryDate: string;
      specs: string;
      title: string;
    }> = [
      {
        status: 'pending',
        companyName: 'TechLab Institute',
        contactPerson: 'Emeka Okafor',
        email: 'emeka.o@techlab.com',
        phone: '+234 803 111 2233',
        components: 'Arduino Uno R3 (50), ESP32 DevKit (30), DHT22 (40)',
        quantity: '120',
        budget: '2,235,000',
        deliveryDate: '2026-05-15',
        specs: 'Undergraduate electronics lab restock',
        title: 'Arduino & Sensor Bulk Kit',
      },
      {
        status: 'under_review',
        companyName: 'Lagos STEM Academy',
        contactPerson: 'Amina Yusuf',
        email: 'amina.y@lagosstem.edu.ng',
        phone: '+234 802 445 7788',
        components: 'Raspberry Pi 4 (20), 12V 5A PSU (20)',
        quantity: '40',
        budget: '4,800,000',
        deliveryDate: '2026-06-01',
        specs: 'Coding club hardware kits',
        title: 'Raspberry Pi Classroom Pack',
      },
      {
        status: 'approved',
        companyName: 'Regalia Electrical',
        contactPerson: 'Bayonuga Bello',
        email: this.config.get('seed.buyerEmail', { infer: true }),
        phone: '+2348090000001',
        components: 'NEMA 17 Stepper (25), Arduino Nano (40)',
        quantity: '65',
        budget: '1,450,000',
        deliveryDate: '2026-04-20',
        specs: 'CNC teaching lab replenishment',
        title: 'Motion Control Bundle',
      },
      {
        status: 'rejected',
        companyName: 'GreenField Robotics',
        contactPerson: 'Chidi Nwosu',
        email: 'chidi@greenfield.ng',
        phone: '+234 701 223 4455',
        components: 'HC-SR04 Ultrasonic (100), OLED 128x64 (50)',
        quantity: '150',
        budget: '890,000',
        deliveryDate: '2026-03-30',
        specs: 'Budget exceeded preferred vendor quote',
        title: 'Sensor Starter Lot',
      },
      {
        status: 'pending',
        companyName: 'Ikeja Polytechnic',
        contactPerson: 'Funke Adeyemi',
        email: 'f.adeyemi@ikejapoly.edu.ng',
        phone: '+234 805 667 8899',
        components: 'Breadboard 830 (80), Arduino Uno R3 (40)',
        quantity: '120',
        budget: '980,000',
        deliveryDate: '2026-05-30',
        specs: 'ND1 practicals restock',
        title: 'Breadboard Lab Pack',
      },
      {
        status: 'draft',
        companyName: 'Regalia Electrical',
        contactPerson: 'Bayonuga Bello',
        email: this.config.get('seed.buyerEmail', { infer: true }),
        phone: '+2348090000001',
        components: 'ESP32 DevKit (15), OLED 128x64 (15)',
        quantity: '30',
        budget: '420,000',
        deliveryDate: '',
        specs: 'Draft — awaiting internal approval',
        title: 'IoT Demo Kit Draft',
      },
    ];

    let created = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i]!;
      const reference = `QTE-${year}-${1800 + i}`;
      const existing = await this.quotes.findOne({ where: { reference } });
      if (existing) continue;

      const buyer =
        buyers.find((user) => user.email === sample.email) ??
        buyers[i % buyers.length]!;

      await this.quotes.save(
        this.quotes.create({
          reference,
          userId: buyer.id,
          status: sample.status,
          companyName: sample.companyName,
          contactPerson: sample.contactPerson,
          email: sample.email,
          phone: sample.phone,
          components: sample.components,
          quantity: sample.quantity,
          budget: sample.budget,
          deliveryDate: sample.deliveryDate,
          specs: sample.specs,
          title: sample.title,
        }),
      );
      created += 1;
    }

    if (created > 0) {
      this.logger.log(`Seeded ${created} demo procurement quotes.`);
    }
  }
}
