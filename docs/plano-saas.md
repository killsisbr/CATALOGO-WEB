# Plano Completo SaaS Multi-Tenant - DeliveryHub

> **Versao:** 1.0  
> **Data:** 2025-12-27  
> **Autor:** killsis (Lucas Larocca)

---

## 1. Visao Geral do Projeto

### 1.1 O Que E
Plataforma SaaS que permite que qualquer dono de restaurante, lanchonete, acaiteria, pizzaria, etc. crie sua propria loja virtual de delivery em minutos, com integracao WhatsApp automatica.

### 1.2 Proposta de Valor
- **Para o Dono do Negocio:** Loja online profissional sem precisar de desenvolvedor
- **Para o Cliente Final:** Experiencia de pedido moderna e rapida
- **Para Nos:** Receita recorrente via assinaturas mensais

### 1.3 Modelo de Negocio
```
+------------------+     +------------------+     +------------------+
|   Landing Page   | --> |    Onboarding    | --> |   Dashboard      |
|   (Marketing)    |     |   (6 Steps)      |     |   (Gestao)       |
+------------------+     +------------------+     +------------------+
         |                        |                        |
         v                        v                        v
   Trial 30 dias          Configurar Loja           Gerenciar Tudo
```

---

## 2. Arquitetura Tecnica

### 2.1 Estrutura de Pastas (Monorepo)
```
deliveryhub/
├── apps/
│   ├── landing/              # Site marketing (Next.js)
│   ├── dashboard/            # Painel admin do tenant (Next.js)
│   └── store/                # Loja publica do cliente (Next.js)
├── packages/
│   ├── ui/                   # Componentes compartilhados
│   ├── database/             # Prisma ORM + migrations
│   ├── auth/                 # Autenticacao JWT
│   ├── themes/               # Sistema de temas
│   └── utils/                # Funcoes utilitarias
├── services/
│   ├── api/                  # API principal (Express/Fastify)
│   ├── whatsapp/             # Servico WhatsApp isolado
│   ├── payments/             # Gateway pagamentos
│   └── notifications/        # Email/Push/SMS
├── docker/
│   ├── docker-compose.yml
│   └── Dockerfile.*
└── docs/
    └── plano-saas.md         # Este arquivo
```

### 2.2 Stack Tecnologica

| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| **Frontend** | Next.js 14 | SSR, App Router, otimizado |
| **Styling** | Tailwind CSS + Shadcn/UI | Rapido, consistente |
| **Backend** | Node.js + Fastify | Performance, TypeScript |
| **Database** | PostgreSQL | Relacional, robusto |
| **Cache** | Redis | Sessoes, filas, cache |
| **ORM** | Prisma | Type-safe, migrations |
| **Auth** | NextAuth.js + JWT | Flexivel, seguro |
| **Storage** | Cloudinary/S3 | Imagens otimizadas |
| **WhatsApp** | whatsapp-web.js / Meta API | Automacao mensagens |
| **Payments** | Stripe / PagSeguro | Assinaturas |
| **Deploy** | Vercel + Railway | Escalavel, facil |

### 2.3 Diagrama de Arquitetura
```
                    +---------------------------+
                    |      LOAD BALANCER        |
                    |       (Cloudflare)        |
                    +---------------------------+
                              |
        +---------------------+---------------------+
        |                     |                     |
+---------------+    +---------------+    +---------------+
|   Landing     |    |   Dashboard   |    |    Store      |
|   app.hub.com |    | dash.hub.com  |    | *.hub.com     |
+---------------+    +---------------+    +---------------+
        |                     |                     |
        +---------------------+---------------------+
                              |
                    +---------------------------+
                    |        API Gateway        |
                    |     (Rate Limiting)       |
                    +---------------------------+
                              |
        +---------------------+---------------------+
        |                     |                     |
+---------------+    +---------------+    +---------------+
|   Auth API    |    |  Tenant API   |    | WhatsApp Svc  |
+---------------+    +---------------+    +---------------+
        |                     |                     |
        +---------------------+---------------------+
                              |
                    +---------------------------+
                    |       PostgreSQL          |
                    |   + Redis (Cache/Queue)   |
                    +---------------------------+
```

---

## 3. Banco de Dados

### 3.1 Diagrama ER
```
+------------------+       +------------------+       +------------------+
|      users       |       |     tenants      |       |   subscriptions  |
+------------------+       +------------------+       +------------------+
| id (UUID)        |<----->| id (UUID)        |<----->| id (UUID)        |
| email            |       | owner_id (FK)    |       | tenant_id (FK)   |
| password_hash    |       | name             |       | plan_id (FK)     |
| name             |       | slug             |       | status           |
| role             |       | logo_url         |       | trial_ends_at    |
| created_at       |       | theme_id (FK)    |       | current_period   |
+------------------+       | settings (JSON)  |       +------------------+
                           | status           |
                           | created_at       |
                           +------------------+
                                    |
        +---------------------------+---------------------------+
        |                           |                           |
+------------------+       +------------------+       +------------------+
|   categories     |       |    products      |       |     orders       |
+------------------+       +------------------+       +------------------+
| id (UUID)        |       | id (UUID)        |       | id (UUID)        |
| tenant_id (FK)   |       | tenant_id (FK)   |       | tenant_id (FK)   |
| name             |       | category_id (FK) |       | customer_name    |
| order_index      |       | name             |       | customer_phone   |
| is_active        |       | description      |       | items (JSON)     |
+------------------+       | price            |       | total            |
                           | images (JSON)    |       | status           |
                           | is_available     |       | delivery_type    |
                           +------------------+       | created_at       |
                                                      +------------------+
```

### 3.2 Schema Prisma Completo
```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ========== USUARIOS ==========
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String    @map("password_hash")
  name          String
  phone         String?
  role          UserRole  @default(OWNER)
  emailVerified DateTime? @map("email_verified")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  
  tenants       Tenant[]  @relation("TenantOwner")
  sessions      Session[]
  
  @@map("users")
}

enum UserRole {
  SUPER_ADMIN   // Nos (plataforma)
  OWNER         // Dono do restaurante
  MANAGER       // Gerente da loja
  STAFF         // Funcionario
}

model Session {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  token     String   @unique
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")
  
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("sessions")
}

// ========== TENANTS (LOJAS) ==========
model Tenant {
  id          String       @id @default(uuid())
  ownerId     String       @map("owner_id")
  name        String
  slug        String       @unique  // brutus-burger
  businessType BusinessType
  logoUrl     String?      @map("logo_url")
  themeId     String?      @map("theme_id")
  settings    Json         @default("{}")
  status      TenantStatus @default(ACTIVE)
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt @map("updated_at")
  
  owner        User         @relation("TenantOwner", fields: [ownerId], references: [id])
  theme        Theme?       @relation(fields: [themeId], references: [id])
  subscription Subscription?
  categories   Category[]
  products     Product[]
  orders       Order[]
  customers    Customer[]
  whatsapp     WhatsAppConfig?
  
  @@map("tenants")
}

enum BusinessType {
  HAMBURGUERIA
  PIZZARIA
  ACAITERIA
  RESTAURANTE
  LANCHONETE
  CAFETERIA
  DOCERIA
  MARMITARIA
  JAPONESA
  MEXICANA
  ARABE
  OUTROS
}

enum TenantStatus {
  ACTIVE
  SUSPENDED
  CANCELLED
}

// ========== TEMAS ==========
model Theme {
  id              String   @id @default(uuid())
  name            String
  slug            String   @unique
  businessTypes   BusinessType[]  // Tipos de negocio compativeis
  isPremium       Boolean  @default(false) @map("is_premium")
  
  // Cores
  primaryColor    String   @map("primary_color")
  secondaryColor  String   @map("secondary_color")
  accentColor     String   @map("accent_color")
  backgroundColor String   @map("background_color")
  textColor       String   @map("text_color")
  
  // Tipografia
  fontFamily      String   @default("Inter") @map("font_family")
  fontHeading     String   @default("Inter") @map("font_heading")
  
  // Layout
  borderRadius    String   @default("8px") @map("border_radius")
  cardStyle       CardStyle @default(GLASS)
  buttonStyle     ButtonStyle @default(ROUNDED)
  
  // Assets
  previewImage    String?  @map("preview_image")
  cssVariables    Json     @default("{}") @map("css_variables")
  
  createdAt       DateTime @default(now()) @map("created_at")
  
  tenants         Tenant[]
  
  @@map("themes")
}

enum CardStyle {
  FLAT
  GLASS
  SHADOW
  BORDERED
  GRADIENT
}

enum ButtonStyle {
  ROUNDED
  PILL
  SQUARE
  OUTLINE
}

// ========== PLANOS E ASSINATURAS ==========
model Plan {
  id            String   @id @default(uuid())
  name          String
  slug          String   @unique
  price         Decimal  @db.Decimal(10, 2)
  interval      String   @default("month")  // month, year
  
  // Limites
  maxProducts   Int      @default(50) @map("max_products")
  maxOrders     Int      @default(500) @map("max_orders")  // por mes
  maxImages     Int      @default(3) @map("max_images")     // por produto
  
  // Features
  features      Json     @default("[]")
  hasWhatsApp   Boolean  @default(true) @map("has_whatsapp")
  hasCustomDomain Boolean @default(false) @map("has_custom_domain")
  hasPremiumThemes Boolean @default(false) @map("has_premium_themes")
  hasAnalytics  Boolean  @default(false) @map("has_analytics")
  hasMultiUser  Boolean  @default(false) @map("has_multi_user")
  
  isActive      Boolean  @default(true) @map("is_active")
  createdAt     DateTime @default(now()) @map("created_at")
  
  subscriptions Subscription[]
  
  @@map("plans")
}

model Subscription {
  id              String   @id @default(uuid())
  tenantId        String   @unique @map("tenant_id")
  planId          String   @map("plan_id")
  status          SubStatus @default(TRIALING)
  
  trialEndsAt     DateTime? @map("trial_ends_at")
  currentPeriodStart DateTime @map("current_period_start")
  currentPeriodEnd   DateTime @map("current_period_end")
  
  stripeCustomerId    String? @map("stripe_customer_id")
  stripeSubscriptionId String? @map("stripe_subscription_id")
  
  cancelledAt     DateTime? @map("cancelled_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  
  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  plan            Plan      @relation(fields: [planId], references: [id])
  
  @@map("subscriptions")
}

enum SubStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELLED
  UNPAID
}

// ========== CATEGORIAS E PRODUTOS ==========
model Category {
  id          String   @id @default(uuid())
  tenantId    String   @map("tenant_id")
  name        String
  description String?
  icon        String?
  orderIndex  Int      @default(0) @map("order_index")
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  
  tenant      Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  products    Product[]
  
  @@unique([tenantId, name])
  @@map("categories")
}

model Product {
  id           String   @id @default(uuid())
  tenantId     String   @map("tenant_id")
  categoryId   String   @map("category_id")
  name         String
  description  String?
  price        Decimal  @db.Decimal(10, 2)
  images       Json     @default("[]")  // Array de URLs
  
  isAvailable  Boolean  @default(true) @map("is_available")
  isFeatured   Boolean  @default(false) @map("is_featured")
  orderIndex   Int      @default(0) @map("order_index")
  
  // Adicionais/Opcoes
  hasAddons    Boolean  @default(false) @map("has_addons")
  addons       Json     @default("[]")  // Array de opcoes
  
  // Informacoes nutricionais (opcional)
  nutritionInfo Json?   @map("nutrition_info")
  
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  
  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  category     Category @relation(fields: [categoryId], references: [id])
  
  @@map("products")
}

// ========== CLIENTES E PEDIDOS ==========
model Customer {
  id          String   @id @default(uuid())
  tenantId    String   @map("tenant_id")
  name        String
  phone       String
  email       String?
  address     Json?    // Endereco completo
  notes       String?
  
  totalOrders Int      @default(0) @map("total_orders")
  totalSpent  Decimal  @default(0) @db.Decimal(10, 2) @map("total_spent")
  lastOrderAt DateTime? @map("last_order_at")
  
  createdAt   DateTime @default(now()) @map("created_at")
  
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  orders      Order[]
  
  @@unique([tenantId, phone])
  @@map("customers")
}

model Order {
  id            String      @id @default(uuid())
  tenantId      String      @map("tenant_id")
  customerId    String?     @map("customer_id")
  orderNumber   Int         @map("order_number")
  
  // Dados do cliente (snapshot)
  customerName  String      @map("customer_name")
  customerPhone String      @map("customer_phone")
  
  // Itens
  items         Json        // Array de produtos com quantidade
  subtotal      Decimal     @db.Decimal(10, 2)
  deliveryFee   Decimal     @default(0) @db.Decimal(10, 2) @map("delivery_fee")
  discount      Decimal     @default(0) @db.Decimal(10, 2)
  total         Decimal     @db.Decimal(10, 2)
  
  // Entrega
  deliveryType  DeliveryType @default(DELIVERY) @map("delivery_type")
  address       Json?
  
  // Status
  status        OrderStatus @default(PENDING)
  observation   String?
  
  // Pagamento
  paymentMethod PaymentMethod? @map("payment_method")
  paymentStatus PaymentStatus @default(PENDING) @map("payment_status")
  
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")
  
  tenant        Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  customer      Customer?   @relation(fields: [customerId], references: [id])
  
  @@unique([tenantId, orderNumber])
  @@map("orders")
}

enum DeliveryType {
  DELIVERY
  PICKUP
}

enum OrderStatus {
  PENDING
  CONFIRMED
  PREPARING
  READY
  OUT_FOR_DELIVERY
  DELIVERED
  CANCELLED
}

enum PaymentMethod {
  PIX
  CASH
  CREDIT_CARD
  DEBIT_CARD
}

enum PaymentStatus {
  PENDING
  PAID
  REFUNDED
}

// ========== WHATSAPP ==========
model WhatsAppConfig {
  id          String   @id @default(uuid())
  tenantId    String   @unique @map("tenant_id")
  
  isConnected Boolean  @default(false) @map("is_connected")
  phoneNumber String?  @map("phone_number")
  sessionData Json?    @map("session_data")
  
  // Mensagens automaticas
  welcomeMessage   String? @map("welcome_message")
  confirmationMsg  String? @map("confirmation_message")
  statusUpdateMsg  String? @map("status_update_message")
  
  autoReplyEnabled Boolean @default(true) @map("auto_reply_enabled")
  
  lastConnectedAt DateTime? @map("last_connected_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  
  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@map("whatsapp_configs")
}
```

---

## 4. Sistema de Temas

### 4.1 Temas Pre-definidos
```json
{
  "themes": [
    {
      "id": "fast-food-classic",
      "name": "Fast Food Classico",
      "businessTypes": ["HAMBURGUERIA", "LANCHONETE"],
      "isPremium": false,
      "colors": {
        "primary": "#E53935",
        "secondary": "#FFC107",
        "accent": "#FF5722",
        "background": "#1A1A1A",
        "text": "#FFFFFF"
      },
      "style": {
        "cardStyle": "GLASS",
        "buttonStyle": "ROUNDED",
        "borderRadius": "12px"
      }
    },
    {
      "id": "pizza-italiana",
      "name": "Pizzaria Italiana",
      "businessTypes": ["PIZZARIA"],
      "isPremium": false,
      "colors": {
        "primary": "#2E7D32",
        "secondary": "#D32F2F",
        "accent": "#FFA000",
        "background": "#0D0D0D",
        "text": "#FFFFFF"
      }
    },
    {
      "id": "acai-tropical",
      "name": "Acai Tropical",
      "businessTypes": ["ACAITERIA"],
      "isPremium": false,
      "colors": {
        "primary": "#6B21A8",
        "secondary": "#EC4899",
        "accent": "#22C55E",
        "background": "#0F0F23",
        "text": "#FFFFFF"
      }
    },
    {
      "id": "oriental-zen",
      "name": "Oriental Zen",
      "businessTypes": ["JAPONESA"],
      "isPremium": true,
      "colors": {
        "primary": "#DC2626",
        "secondary": "#0F172A",
        "accent": "#F59E0B",
        "background": "#0C0C0C",
        "text": "#FFFFFF"
      }
    },
    {
      "id": "mexican-fiesta",
      "name": "Mexicano Fiesta",
      "businessTypes": ["MEXICANA"],
      "isPremium": true,
      "colors": {
        "primary": "#16A34A",
        "secondary": "#DC2626",
        "accent": "#FACC15",
        "background": "#1C1917",
        "text": "#FFFFFF"
      }
    },
    {
      "id": "cafe-premium",
      "name": "Cafe Premium",
      "businessTypes": ["CAFETERIA", "DOCERIA"],
      "isPremium": true,
      "colors": {
        "primary": "#78350F",
        "secondary": "#F59E0B",
        "accent": "#D97706",
        "background": "#1C1917",
        "text": "#FEF3C7"
      }
    },
    {
      "id": "marmita-caseira",
      "name": "Marmita Caseira",
      "businessTypes": ["MARMITARIA", "RESTAURANTE"],
      "isPremium": false,
      "colors": {
        "primary": "#15803D",
        "secondary": "#EA580C",
        "accent": "#84CC16",
        "background": "#14532D",
        "text": "#FFFFFF"
      }
    },
    {
      "id": "dark-minimalist",
      "name": "Dark Minimalista",
      "businessTypes": ["TODOS"],
      "isPremium": false,
      "colors": {
        "primary": "#6366F1",
        "secondary": "#8B5CF6",
        "accent": "#A855F7",
        "background": "#0F0F0F",
        "text": "#FFFFFF"
      }
    }
  ]
}
```

### 4.2 Estrutura CSS do Tema
```css
/* themes/theme-base.css */
:root {
  /* Cores - sobrescritas pelo tema */
  --primary: #27ae60;
  --primary-light: color-mix(in srgb, var(--primary) 85%, white);
  --primary-dark: color-mix(in srgb, var(--primary) 85%, black);
  --secondary: #f39c12;
  --accent: #e74c3c;
  --background: #121212;
  --surface: #1e1e1e;
  --text: #ffffff;
  --text-muted: #a0a0a0;
  --border: #333333;
  
  /* Espacamento */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-full: 9999px;
  
  /* Tipografia */
  --font-body: 'Inter', sans-serif;
  --font-heading: 'Inter', sans-serif;
  
  /* Sombras */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
  
  /* Glass Effect */
  --glass-bg: rgba(30, 30, 30, 0.7);
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-blur: blur(10px);
}

/* Card Styles */
.card--flat {
  background: var(--surface);
  border: 1px solid var(--border);
}

.card--glass {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
}

.card--shadow {
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.card--gradient {
  background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
}

/* Button Styles */
.btn--rounded {
  border-radius: var(--radius-md);
}

.btn--pill {
  border-radius: var(--radius-full);
}

.btn--square {
  border-radius: var(--radius-sm);
}

.btn--outline {
  background: transparent;
  border: 2px solid var(--primary);
  color: var(--primary);
}
```

---

## 5. Fluxo de Onboarding (6 Steps)

### 5.1 Fluxo Visual
```
    [1]         [2]          [3]          [4]         [5]         [6]
   Criar       Tipo de      Config       Primeiro    WhatsApp    Pronto!
   Conta       Negocio      Loja         Produto
     |            |            |            |           |           |
   Email       Selecao      Nome         Nome        QR Code     Dashboard
   Senha       Icones       Slug         Descricao   Opcional    Tour
              Grid         Logo         Preco
                           Tema         Imagem
```

### 5.2 Step 1: Criar Conta
```typescript
// Formulario
interface CreateAccountForm {
  name: string;         // Nome completo
  email: string;        // Email valido
  phone: string;        // Telefone com DDD
  password: string;     // Min 8 caracteres
}

// Validacoes
- Email unico
- Senha forte (1 maiuscula, 1 numero, 1 especial)
- Telefone valido (para WhatsApp)
```

### 5.3 Step 2: Tipo de Negocio
```typescript
const businessTypes = [
  { id: 'HAMBURGUERIA', icon: 'burger', label: 'Hamburgueria' },
  { id: 'PIZZARIA', icon: 'pizza', label: 'Pizzaria' },
  { id: 'ACAITERIA', icon: 'bowl', label: 'Acaiteria' },
  { id: 'RESTAURANTE', icon: 'restaurant', label: 'Restaurante' },
  { id: 'LANCHONETE', icon: 'sandwich', label: 'Lanchonete' },
  { id: 'CAFETERIA', icon: 'coffee', label: 'Cafeteria' },
  { id: 'DOCERIA', icon: 'cake', label: 'Doceria' },
  { id: 'MARMITARIA', icon: 'lunchbox', label: 'Marmitaria' },
  { id: 'JAPONESA', icon: 'sushi', label: 'Japonesa' },
  { id: 'MEXICANA', icon: 'taco', label: 'Mexicana' },
  { id: 'OUTROS', icon: 'utensils', label: 'Outros' }
];
```

### 5.4 Step 3: Configurar Loja
```typescript
interface StoreConfigForm {
  name: string;           // "Brutus Burger"
  slug: string;           // "brutus-burger" (auto-gerado)
  logo?: File;            // Upload opcional
  themeId: string;        // Tema selecionado
  
  // Contato
  phone: string;
  whatsapp: string;
  
  // Endereco
  address?: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  
  // Horario
  schedule: {
    monday: { open: string; close: string; isOpen: boolean };
    // ... outros dias
  };
}
```

### 5.5 Step 4: Primeiro Produto
```typescript
interface FirstProductForm {
  name: string;           // "X-Bacon"
  description: string;    // "Hamburguer artesanal..."
  price: number;          // 25.90
  categoryName: string;   // "Hamburgueres"
  image?: File;           // Upload opcional
}

// Template sugerido baseado no tipo de negocio
const productTemplates = {
  HAMBURGUERIA: [
    { name: 'X-Salada', price: 18.90 },
    { name: 'X-Bacon', price: 22.90 },
    { name: 'X-Tudo', price: 28.90 }
  ],
  PIZZARIA: [
    { name: 'Pizza Margherita', price: 39.90 },
    { name: 'Pizza Calabresa', price: 44.90 }
  ]
  // ...
};
```

### 5.6 Step 5: WhatsApp
```typescript
// Opcoes
const whatsappOptions = [
  {
    id: 'connect-now',
    title: 'Conectar Agora',
    description: 'Escaneie o QR Code',
    action: 'showQRCode'
  },
  {
    id: 'connect-later',
    title: 'Conectar Depois',
    description: 'Configure pelo painel',
    action: 'skip'
  }
];

// Mensagens automaticas default
const defaultMessages = {
  welcome: 'Ola! Bem-vindo ao {{storeName}}! Como posso ajudar?',
  confirmation: 'Pedido #{{orderNumber}} confirmado! Previsao: {{time}} min',
  ready: 'Seu pedido #{{orderNumber}} esta pronto!'
};
```

### 5.7 Step 6: Conclusao
```typescript
// Checklist final
interface OnboardingComplete {
  accountCreated: true;
  businessTypeSelected: true;
  storeConfigured: true;
  firstProductAdded: true;
  whatsappStatus: 'connected' | 'skipped';
  
  // Links para o usuario
  storeUrl: string;      // brutus-burger.deliveryhub.com
  dashboardUrl: string;  // dashboard.deliveryhub.com
  
  // Trial info
  trialEndsAt: Date;     // 30 dias a partir de agora
  planName: 'Trial';
}
```

---

## 6. APIs

### 6.1 Autenticacao
```typescript
// POST /api/auth/register
{
  "name": "Lucas Larocca",
  "email": "lucas@example.com",
  "phone": "42999830000",
  "password": "Senha@123"
}

// POST /api/auth/login
{
  "email": "lucas@example.com",
  "password": "Senha@123"
}

// Response
{
  "user": { id, name, email },
  "token": "jwt...",
  "tenant": { id, slug, name }
}
```

### 6.2 Tenants
```typescript
// POST /api/tenants
{
  "name": "Brutus Burger",
  "businessType": "HAMBURGUERIA",
  "themeId": "fast-food-classic"
}

// GET /api/tenants/:slug
{
  "id": "uuid",
  "name": "Brutus Burger",
  "slug": "brutus-burger",
  "logoUrl": "https://...",
  "settings": {...},
  "theme": {...}
}

// PUT /api/tenants/:id/settings
{
  "schedule": {...},
  "deliveryFee": 5.00,
  "minOrder": 20.00,
  "pixKey": "email@pix.com"
}
```

### 6.3 Produtos
```typescript
// GET /api/tenants/:tenantId/products
// POST /api/tenants/:tenantId/products
// PUT /api/tenants/:tenantId/products/:id
// DELETE /api/tenants/:tenantId/products/:id

// Estrutura do produto
{
  "name": "X-Bacon",
  "description": "Hamburguer artesanal...",
  "price": 25.90,
  "categoryId": "uuid",
  "images": ["url1", "url2"],
  "isAvailable": true,
  "addons": [
    {
      "name": "Bacon Extra",
      "price": 5.00
    }
  ]
}
```

### 6.4 Pedidos
```typescript
// POST /api/tenants/:tenantId/orders
{
  "customerName": "Joao",
  "customerPhone": "42999000000",
  "items": [
    { "productId": "uuid", "quantity": 2, "addons": [] }
  ],
  "deliveryType": "DELIVERY",
  "address": {...},
  "paymentMethod": "PIX",
  "observation": "Sem cebola"
}

// PUT /api/tenants/:tenantId/orders/:id/status
{
  "status": "CONFIRMED"
}

// GET /api/tenants/:tenantId/orders?status=PENDING&date=today
```

### 6.5 WhatsApp
```typescript
// GET /api/tenants/:tenantId/whatsapp/status
{
  "isConnected": true,
  "phoneNumber": "5542999830000",
  "lastConnectedAt": "2025-12-27T10:00:00Z"
}

// POST /api/tenants/:tenantId/whatsapp/qr
// Response: QR Code em base64

// POST /api/tenants/:tenantId/whatsapp/disconnect
```

---

## 7. Planos e Precos

### 7.1 Tabela de Planos
| Recurso | Gratis (Trial) | Starter | Pro | Enterprise |
|---------|----------------|---------|-----|------------|
| **Preco** | R$ 0/mes (30 dias) | R$ 49/mes | R$ 99/mes | R$ 199/mes |
| **Produtos** | 20 | 50 | Ilimitado | Ilimitado |
| **Pedidos/mes** | 100 | 500 | Ilimitado | Ilimitado |
| **Imagens/produto** | 1 | 3 | 5 | 10 |
| **WhatsApp** | Sim | Sim | Sim | Sim |
| **Temas Premium** | Nao | Nao | Sim | Sim |
| **Dominio Custom** | Nao | Nao | Sim | Sim |
| **Dashboard Analytics** | Basico | Basico | Completo | Completo |
| **Multi-usuarios** | 1 | 2 | 5 | Ilimitado |
| **Suporte** | Email | Email | Prioritario | Dedicado |
| **API Access** | Nao | Nao | Nao | Sim |

### 7.2 Logica de Trial
```typescript
// Ao criar conta
const subscription = {
  planId: 'trial',
  status: 'TRIALING',
  trialEndsAt: addDays(new Date(), 30),
  currentPeriodStart: new Date(),
  currentPeriodEnd: addDays(new Date(), 30)
};

// Cron job diario - verificar trials expirados
async function checkTrialExpirations() {
  const expiredTrials = await db.subscription.findMany({
    where: {
      status: 'TRIALING',
      trialEndsAt: { lt: new Date() }
    }
  });
  
  for (const sub of expiredTrials) {
    await db.tenant.update({
      where: { id: sub.tenantId },
      data: { status: 'SUSPENDED' }
    });
    
    await sendEmail(sub.tenant.owner.email, 'trial-expired');
  }
}
```

---

## 8. Seguranca

### 8.1 Autenticacao
```typescript
// JWT Token
interface JWTPayload {
  userId: string;
  tenantId: string;
  role: UserRole;
  exp: number;
}

// Middleware de autenticacao
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token nao fornecido' });
  }
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalido' });
  }
}
```

### 8.2 Isolamento de Tenant
```typescript
// Middleware de tenant
async function tenantMiddleware(req, res, next) {
  const tenantId = req.params.tenantId || req.user.tenantId;
  
  // Verificar se usuario tem acesso ao tenant
  if (req.user.tenantId !== tenantId && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  
  // Injetar tenant no request
  req.tenantId = tenantId;
  next();
}

// Todas as queries incluem tenantId
const products = await db.product.findMany({
  where: { tenantId: req.tenantId }
});
```

### 8.3 Rate Limiting
```typescript
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,                  // 100 requests por window
  message: 'Muitas requisicoes, tente novamente depois'
});

// Por tenant (mais restritivo para trial)
const tenantRateLimiter = async (req, res, next) => {
  const subscription = await getSubscription(req.tenantId);
  
  const limits = {
    'TRIALING': 50,
    'STARTER': 100,
    'PRO': 500,
    'ENTERPRISE': Infinity
  };
  
  // ... implementar
};
```

---

## 9. Deploy e Infraestrutura

### 9.1 Ambientes
```
Desenvolvimento: localhost:3000
Staging:         staging.deliveryhub.com
Producao:        deliveryhub.com
```

### 9.2 Docker Compose
```yaml
version: '3.8'

services:
  api:
    build: ./services/api
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/deliveryhub
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - db
      - redis
  
  whatsapp:
    build: ./services/whatsapp
    volumes:
      - whatsapp-sessions:/app/sessions
    environment:
      - API_URL=http://api:3000
  
  db:
    image: postgres:15
    volumes:
      - postgres-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=deliveryhub
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  postgres-data:
  redis-data:
  whatsapp-sessions:
```

### 9.3 CI/CD (GitHub Actions)
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install & Build
        run: |
          npm ci
          npm run build
      
      - name: Run Tests
        run: npm test
      
      - name: Deploy to Vercel
        uses: vercel/action@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
```

---

## 10. Metricas e Monitoramento

### 10.1 KPIs Principais
```typescript
interface PlatformMetrics {
  // Usuarios
  totalUsers: number;
  activeUsers: number;     // Logaram nos ultimos 7 dias
  newUsersToday: number;
  
  // Tenants
  totalTenants: number;
  activeStores: number;    // Com pedidos nos ultimos 7 dias
  
  // Conversao
  trialToPayingRate: number;  // % que converte
  avgTrialDuration: number;   // Dias ate conversao
  churnRate: number;          // % cancelamentos/mes
  
  // Financeiro
  mrr: number;             // Monthly Recurring Revenue
  arr: number;             // Annual Recurring Revenue
  avgRevenuePerUser: number;
  
  // Operacional
  totalOrders: number;
  ordersToday: number;
  avgOrderValue: number;
}
```

### 10.2 Dashboard Admin (Super Admin)
```
+------------------------------------------+
|           DeliveryHub Admin              |
+------------------------------------------+
|                                          |
|  [MRR: R$ 15.890]  [Tenants: 312]       |
|  [Trial Conv: 23%]  [Orders: 5.420]     |
|                                          |
|  +------------------------------------+  |
|  |  Novos Cadastros (ultimos 7 dias) |  |
|  |  [Grafico de linha]               |  |
|  +------------------------------------+  |
|                                          |
|  +------------------------------------+  |
|  |  Tenants por Plano                |  |
|  |  [Grafico de pizza]               |  |
|  +------------------------------------+  |
|                                          |
+------------------------------------------+
```

---

## 11. Cronograma de Desenvolvimento

### Fase 1: MVP (4 semanas)
| Semana | Tarefas |
|--------|---------|
| 1 | Setup monorepo, banco PostgreSQL, Prisma schema |
| 2 | Auth (registro, login, JWT), CRUD tenants |
| 3 | CRUD produtos/categorias, sistema de temas |
| 4 | Onboarding wizard, landing page basica |

### Fase 2: Core Features (4 semanas)
| Semana | Tarefas |
|--------|---------|
| 5 | Sistema de pedidos, carrinho |
| 6 | WhatsApp service isolado, sessoes por tenant |
| 7 | Dashboard admin, metricas basicas |
| 8 | Testes, bugfixes, otimizacoes |

### Fase 3: Monetizacao (2 semanas)
| Semana | Tarefas |
|--------|---------|
| 9 | Stripe/PagSeguro, planos, trial |
| 10 | Emails transacionais, cobrancas |

### Fase 4: Escala (2 semanas)
| Semana | Tarefas |
|--------|---------|
| 11 | CDN, cache, performance |
| 12 | Subdominios dinamicos, dominio custom |

---

## 12. Checklist de Lancamento

### Pre-Lancamento
- [ ] Termos de Uso redigidos
- [ ] Politica de Privacidade (LGPD)
- [ ] Sistema de backup automatico
- [ ] Monitoramento de erros (Sentry)
- [ ] Analytics (PostHog/Mixpanel)
- [ ] Testes de carga
- [ ] Documentacao API

### Lancamento
- [ ] Landing page no ar
- [ ] Onboarding funcionando
- [ ] WhatsApp estavel
- [ ] Pagamentos funcionando
- [ ] Emails configurados
- [ ] Suporte pronto

### Pos-Lancamento
- [ ] Acompanhar metricas diariamente
- [ ] Responder feedback usuarios
- [ ] Corrigir bugs criticos em < 24h
- [ ] Coletar depoimentos para marketing

---

## 13. Proximos Passos Imediatos

1. **Criar estrutura do monorepo**
   ```bash
   mkdir deliveryhub
   cd deliveryhub
   npx create-turbo@latest
   ```

2. **Configurar banco PostgreSQL**
   - Criar database no Railway/Supabase
   - Configurar Prisma
   - Rodar migrations

3. **Implementar Auth**
   - Registro com verificacao email
   - Login com JWT
   - Middleware de autenticacao

4. **Criar Onboarding Wizard**
   - 6 steps conforme documentado
   - Persistencia parcial (salvar progresso)

5. **Landing Page**
   - Hero section
   - Features
   - Precos
   - CTA para registro

---

**Documento vivo - atualizar conforme evolucao do projeto**
