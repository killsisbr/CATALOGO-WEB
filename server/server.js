import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import WhatsAppService from './whatsapp-service.js';
import DeliveryService from './services/delivery-service.js';

// Importar rotas modulares
import authRoutes from './routes/auth.js';
import customSettingsRoutes from './routes/custom-settings.js';
import createCategoriasRoutes from './routes/categorias.js';
import createBlacklistRoutes from './routes/blacklist.js';
import createBuffetRoutes from './routes/buffet.js';
import createWhatsappRoutes, { createRobotRoutes } from './routes/whatsapp.js';
import createEntregaRoutes from './routes/entrega.js';
import createEstatisticasRoutes from './routes/estatisticas.js';
import createProdutosRoutes from './routes/produtos.js';
import createAcaiRoutes from './routes/acai.js';
import createPedidosRoutes from './routes/pedidos.js';
import createInstallRoutes from './routes/install.js';
import eventsRoutes from './routes/events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('Variáveis de ambiente carregadas:');
console.log('   PORT:', process.env.PORT);
console.log('   WHATSAPP_GROUP_ID:', process.env.WHATSAPP_GROUP_ID);
console.log('   ORS_API_KEY:', process.env.ORS_API_KEY ? 'Configurada' : 'Não configurada');

const app = express();
const PORT = process.env.PORT || 4004;

// Template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware estático
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================
// SEGURANÇA
// ============================================================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

const createOrderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Limite de pedidos atingido. Aguarde um momento.' }
});

app.use('/api/', apiLimiter);
app.use('/api/pedidos', createOrderLimiter);

console.log('Segurança: Helmet e Rate Limiting ativados');

// ============================================================
// CONFIGURAÇÃO DE UPLOAD
// ============================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos!'));
    }
  }
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// ============================================================
// VARIÁVEIS GLOBAIS
// ============================================================
let db;
let whatsappService;
let deliveryService;
let robotEnabled = false;

// Getters para rotas que precisam de acesso a serviços
const getWhatsappService = () => whatsappService;
const getDeliveryService = () => deliveryService;
const getRobotEnabled = () => robotEnabled;
const setRobotEnabled = (val) => { robotEnabled = val; };

// ============================================================
// ROTAS ESTÁTICAS
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pedido.html'));
});

app.get('/pedido', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pedido.html'));
});

app.get('/custom', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/custom.html'));
});

app.get('/pedido/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pedido-detalhe.html'));
});

app.get('/api/config/google-maps-key', (req, res) => {
  res.json({ apiKey: process.env.GOOGLE_MAPS_API_KEY || 'SuaChaveDaApiAqui' });
});

// ============================================================
// REGISTRAR ROTAS MODULARES
// ============================================================
function registerRoutes() {
  // Auth (não precisa db)
  app.use('/api', authRoutes);
  app.get('/auth/welcome', authRoutes);

  // Custom Settings (não precisa db)
  app.use('/api/custom-settings', customSettingsRoutes);

  // Rotas que precisam de DB
  app.use('/api/categorias', createCategoriasRoutes(db));
  app.use('/api/blacklist', createBlacklistRoutes(db));
  app.use('/api/buffet', createBuffetRoutes(db));
  app.use('/api/estatisticas', createEstatisticasRoutes(db));
  app.use('/api/produtos', createProdutosRoutes(db, upload));
  app.use('/api/acai', createAcaiRoutes(db));

  // Rotas que precisam de serviços externos
  app.use('/api/whatsapp', createWhatsappRoutes(getWhatsappService, getRobotEnabled, setRobotEnabled));
  app.use('/api/robot', createRobotRoutes(getRobotEnabled, setRobotEnabled));
  app.use('/api/entrega', createEntregaRoutes(deliveryService));

  // Pedidos (mais complexo - precisa de tudo)
  app.use('/api/pedidos', createPedidosRoutes(db, {
    getWhatsappService,
    getRobotEnabled,
    getDeliveryService
  }));

  // Install
  app.use('/install', createInstallRoutes(db));
  app.use('/api/install', createInstallRoutes(db));

  // SSE Events (tempo real)
  app.use('/api/events', eventsRoutes);

  // Endpoint para cliente por WhatsApp ID
  app.get('/api/clientes/:whatsappId', async (req, res) => {
    try {
      const { whatsappId } = req.params;
      const digitOnly = String(whatsappId || '').replace(/\D/g, '');
      const trySuffix = String(whatsappId || '').includes('@') ? whatsappId : whatsappId + '@c.us';

      const cliente = await db.get(
        `SELECT * FROM clientes WHERE whatsapp_id = ? OR whatsapp_id = ? OR REPLACE(REPLACE(whatsapp_id, '@c.us', ''), '@g.us', '') = ?`,
        [whatsappId, trySuffix, digitOnly]
      );

      if (cliente) {
        res.json({ success: true, cliente });
      } else {
        res.json({ success: false, message: 'Cliente não encontrado' });
      }
    } catch (error) {
      console.error('Erro ao buscar cliente:', error);
      res.status(500).json({ error: 'Erro ao buscar cliente' });
    }
  });

  console.log('Rotas modulares registradas com sucesso');
}

// ============================================================
// INICIALIZAÇÃO DO BANCO DE DADOS
// ============================================================
async function initDatabase() {
  db = await open({
    filename: path.join(__dirname, 'db.sqlite'),
    driver: sqlite3.Database
  });

  // Criar tabelas
  await db.run(`CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT, descricao TEXT, preco REAL, imagem TEXT, categoria TEXT
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_nome TEXT, cliente_telefone TEXT, cliente_endereco TEXT,
    forma_pagamento TEXT, total REAL, distancia REAL, valor_entrega REAL,
    coordenadas_cliente TEXT, data DATETIME, status TEXT DEFAULT 'pending'
  )`);

  // Migrações
  try { await db.run(`ALTER TABLE pedidos ADD COLUMN distancia REAL`); } catch (e) { }
  try { await db.run(`ALTER TABLE pedidos ADD COLUMN valor_entrega REAL`); } catch (e) { }
  try { await db.run(`ALTER TABLE pedidos ADD COLUMN coordenadas_cliente TEXT`); } catch (e) { }
  try { await db.run(`ALTER TABLE pedidos ADD COLUMN observacao_entrega TEXT`); } catch (e) { }
  try { await db.run(`ALTER TABLE pedidos ADD COLUMN is_pickup INTEGER DEFAULT 0`); } catch (e) { }
  try { await db.run(`ALTER TABLE pedidos ADD COLUMN is_blacklisted INTEGER DEFAULT 0`); } catch (e) { }
  try { await db.run(`ALTER TABLE pedidos ADD COLUMN whatsapp_id TEXT`); } catch (e) { }

  await db.run(`CREATE TABLE IF NOT EXISTS pedido_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER, produto_id INTEGER, quantidade INTEGER,
    preco_unitario REAL, adicionais TEXT, observacao TEXT
  )`);

  try { await db.run(`ALTER TABLE pedido_itens ADD COLUMN adicionais TEXT`); } catch (e) { }
  try { await db.run(`ALTER TABLE pedido_itens ADD COLUMN observacao TEXT`); } catch (e) { }

  await db.run(`CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    whatsapp_id TEXT UNIQUE, nome TEXT, telefone TEXT, endereco TEXT,
    data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT UNIQUE
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS buffet_dia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, ativo INTEGER DEFAULT 1,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS acai_tamanhos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, preco REAL NOT NULL DEFAULT 0,
    adicionais_gratis INTEGER DEFAULT 0, ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1, data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS acai_adicionais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, preco REAL DEFAULT 0, categoria TEXT DEFAULT 'Geral',
    ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS acai_config (
    id INTEGER PRIMARY KEY DEFAULT 1, habilitado INTEGER DEFAULT 1,
    categoria_nome TEXT DEFAULT 'Açaí'
  )`);

  try { await db.run(`INSERT OR IGNORE INTO acai_config (id, habilitado, categoria_nome) VALUES (1, 1, 'Açaí')`); } catch (e) { }

  await db.run(`CREATE TABLE IF NOT EXISTS acai_produto_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER UNIQUE NOT NULL, adicionais_gratis INTEGER DEFAULT 0,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefone TEXT UNIQUE NOT NULL, motivo TEXT,
    data_inclusao DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Indices
  try { await db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_data ON pedidos(data)'); } catch (e) { }
  try { await db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status)'); } catch (e) { }
  try { await db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_telefone)'); } catch (e) { }
  try { await db.run('CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido ON pedido_itens(pedido_id)'); } catch (e) { }

  console.log('Banco de dados inicializado');
  return db;
}

// ============================================================
// POPULAR BANCO DE DADOS
// ============================================================
async function popularBancoDeDados() {
  try {
    const cardapioPath = path.join(__dirname, '../cardapio.json');
    const cardapioData = fs.readFileSync(cardapioPath, 'utf8');
    const cardapio = JSON.parse(cardapioData);

    for (const categoria of cardapio.categorias) {
      for (const item of categoria.itens) {
        await db.run(
          'INSERT INTO produtos (nome, descricao, preco, categoria) VALUES (?, ?, ?, ?)',
          [item.nome, item.descricao || '', item.preco, categoria.nome]
        );
      }
    }

    console.log('Banco de dados populado com sucesso!');
  } catch (error) {
    console.error('Erro ao popular o banco de dados:', error);
  }
}

// ============================================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================================
async function startServer() {
  try {
    await initDatabase();

    // Verificar se há produtos
    const produtosExistentes = await db.get('SELECT COUNT(*) as count FROM produtos');
    if (produtosExistentes.count === 0) {
      await popularBancoDeDados();
    }

    // Inicializar serviços
    whatsappService = new WhatsAppService();
    whatsappService.setRobotEnabledCallback(() => robotEnabled);
    whatsappService.initialize();

    deliveryService = new DeliveryService();

    // Registrar rotas após serviços inicializados
    registerRoutes();

    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Erro ao iniciar o servidor:', error);
  }
}

startServer();