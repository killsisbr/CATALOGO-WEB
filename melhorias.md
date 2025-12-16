# Melhorias do Sistema de Pedidos - CAMPESTRE

> Documento de análise técnica com sugestões de melhorias de segurança, qualidade de código e limpeza.

---

## 1. SEGURANÇA

### 1.1 Problemas Críticos

| Problema | Arquivo | Risco | Sugestão |
|----------|---------|-------|----------|
| JWT Secret hardcoded | `server.js` | **ALTO** | Nunca usar fallback para secret. Falhar se não configurado |
| API Key exposta no frontend | `server.js:232` | **ALTO** | Usar proxy no backend para chamadas de API |
| Sem rate limiting | `server.js` | **MÉDIO** | Implementar `express-rate-limit` |
| Sem validação de input | Vários endpoints | **MÉDIO** | Usar bibliotecas como `joi` ou `zod` |
| Uploads sem validação robusta | `server.js:176` | **MÉDIO** | Verificar magic bytes dos arquivos |

### 1.2 Melhorias Recomendadas

```javascript
// ANTES (inseguro)
const jwtSecret = process.env.JWT_SECRET || 'change_this_secret_in_env';

// DEPOIS (seguro)
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error('ERRO FATAL: JWT_SECRET não configurado!');
  process.exit(1);
}
```

```javascript
// Implementar rate limiting
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // máximo 100 requests por IP
});

app.use('/api/', limiter);
```

### 1.3 Headers de Segurança

```javascript
import helmet from 'helmet';
app.use(helmet());
```

---

## 2. QUALIDADE DE CÓDIGO

### 2.1 Problemas de Estrutura

| Problema | Impacto | Solução |
|----------|---------|---------|
| `server.js` com **2550 linhas** | Difícil manutenção | Modularizar em arquivos separados |
| Endpoints misturados | Código confuso | Organizar por domínio (routes/) |
| Duplicação de código | Inconsistências | Criar funções utilitárias |
| Sem tipagem | Bugs em runtime | Considerar TypeScript |

### 2.2 Sugestão de Modularização

```
server/
├── routes/
│   ├── pedidos.js
│   ├── produtos.js
│   ├── blacklist.js
│   ├── estatisticas.js
│   ├── acai.js
│   └── buffet.js
├── services/
│   ├── delivery-service.js ✓ (já existe)
│   ├── whatsapp-service.js ✓ (já existe)
│   └── database-service.js
├── middleware/
│   ├── auth.js
│   ├── validation.js
│   └── error-handler.js
├── utils/
│   └── helpers.js
└── server.js (apenas inicialização)
```

### 2.3 Melhorias no Frontend

| Arquivo | Tamanho | Problema | Solução |
|---------|---------|----------|---------|
| `pedido-script-debug.js` | 113KB | Versão debug em produção | Remover ou renomear |
| `pedido-script.js` | 95KB | Arquivo muito grande | Dividir em módulos |
| `style.css` | 78KB | CSS monolítico | Usar SCSS/SASS |
| `quadro.js` + `quadro-pc.js` | 96KB | Código duplicado | Unificar lógica comum |

---

## 3. LIMPEZA

### 3.1 Arquivos para Remover/Mover

```
REMOVER:
├── public/
│   ├── debug-carousel.html      # Arquivo de teste
│   ├── debug.html               # Arquivo de teste
│   ├── test-elements.html       # Arquivo de teste
│   ├── test-images.html         # Arquivo de teste
│   ├── test-thermal-print.html  # Arquivo de teste
│   ├── testar-taxa.html         # Arquivo de teste
│   ├── pedido - exemple.html    # Exemplo não usado
│   └── pedido-detalhe - Exemple.js  # Exemplo não usado
│
├── server/
│   ├── check-db.js              # Duplicado (check_db.js)
│   ├── test-sumatra.js          # Arquivo de teste
│   ├── test_image_access.js     # Arquivo de teste
│   ├── test_images.js           # Arquivo de teste
│   └── brutus.db                # DB antigo não usado
│
├── raiz/
│   ├── image_test.jpg           # 561KB - arquivo de teste
│   ├── admin.js                 # Duplicado (existe em public/)
│   ├── pedido_page.html         # Arquivo antigo?
│   ├── test-data.json           # Arquivo de teste
│   ├── prods_preview.json       # Preview não usado
│   └── products_preview.json    # Preview não usado
```

### 3.2 Consolidar Documentação

Mover para pasta `docs/`:
- `CUSTOMIZACAO.md`
- `DEPLOY.md`
- `INSTALL.md`
- `README_ENTREGA.md`
- `SSL.md`
- `SSL_WINDOWS.md`
- `entrega.md`
- `erro_imagem_render.md`
- `melhoria-impressao-termica.md`
- `melhoria.md`
- `reflexo.md`
- `sistema.md`

---

## 4. BANCO DE DADOS

### 4.1 Melhorias de Schema

| Tabela | Problema | Solução |
|--------|----------|---------|
| `pedidos` | Sem índices | Criar índices em `data`, `status`, `cliente_telefone` |
| `blacklist` | Campo `telefone` não normalizado | Padronizar formato |
| Geral | Sem foreign keys | Adicionar constraints |

```sql
-- Índices recomendados
CREATE INDEX idx_pedidos_data ON pedidos(data);
CREATE INDEX idx_pedidos_status ON pedidos(status);
CREATE INDEX idx_pedidos_cliente ON pedidos(cliente_telefone);
```

### 4.2 Backups

Implementar sistema de backup automático:
```javascript
// Backup diário do SQLite
const backupDb = () => {
  const date = new Date().toISOString().split('T')[0];
  fs.copyFileSync('db.sqlite', `backups/db-${date}.sqlite`);
};
```

---

## 5. PERFORMANCE

### 5.1 Otimizações Recomendadas

| Área | Problema | Solução |
|------|----------|---------|
| Consultas SQL | N+1 queries em `/api/pedidos` | Usar JOINs otimizados |
| Imagens | Sem compressão | Comprimir ao fazer upload |
| CSS/JS | Arquivos grandes não minificados | Implementar build de produção |
| Cache | Sem cache de dados | Implementar cache Redis |

---

## 6. PRIORIZAÇÃO

### Fazer AGORA (Segurança Crítica)
1. [x] Remover fallback do JWT_SECRET
2. [ ] Implementar rate limiting
3. [ ] Adicionar validação de inputs

### Fazer em BREVE (Manutenibilidade)
4. [ ] Modularizar server.js em routes
5. [ ] Limpar arquivos de teste
6. [ ] Consolidar documentação

### Fazer DEPOIS (Melhorias)
7. [ ] Implementar TypeScript
8. [ ] Adicionar índices no banco
9. [ ] Sistema de backup automático

---

## 7. ESTIMATIVA DE ESFORÇO

| Tarefa | Tempo Estimado |
|--------|----------------|
| Limpeza de arquivos | 30 min |
| Implementar rate limiting | 1h |
| Modularizar server.js | 4-6h |
| Adicionar validação | 2-3h |
| Consolidar docs | 1h |

---

*Documento gerado em: 15/12/2025*
*Autor: Antigravity AI*
