# 🚀 Guia de Instalação - Sistema de Pedidos para Restaurantes

Este guia explica como configurar uma nova instalação do sistema para um novo restaurante/cliente.

## 📋 Pré-requisitos

- **Node.js** 18+ instalado
- **Git** instalado (opcional, para clonar o repositório)
- Conta no [OpenRouteService](https://openrouteservice.org) (gratuita, para cálculo de distância)
- WhatsApp conectado a um número de telefone

## 🔧 Instalação Rápida

### 1. Clone ou copie o repositório

```bash
git clone <url-do-repositorio> meu-restaurante
cd meu-restaurante
```

### 2. Instale as dependências

```bash
# Dependências da raiz (se houver)
npm install

# Dependências do servidor
cd server
npm install
cd ..
```

### 3. Configure os arquivos iniciais

```bash
# Copiar arquivos de exemplo
cp .env.example .env
cp cardapio.example.json cardapio.json
cp server/custom-settings.example.json server/custom-settings.json
cp server/config/delivery.config.example.js server/config/delivery.config.js
```

### 4. Inicie o servidor

```bash
cd server
npm start
```

### 5. Acesse a página de instalação

Abra o navegador em: **http://localhost:3005/install**

A página de instalação guiará você por todas as configurações:
- Informações do restaurante (nome, contato, logo)
- Cores do tema
- Localização e taxas de entrega
- Cardápio inicial
- Chaves de API

---

## 📁 Estrutura de Arquivos

### Arquivos que **SÃO** versionados (código base):

```
├── public/                     # Frontend (HTML, CSS, JS)
├── server/
│   ├── server.js              # Servidor principal
│   ├── whatsapp-service.js    # Integração WhatsApp
│   ├── services/              # Serviços
│   ├── helpers/               # Utilitários
│   └── views/                 # Templates EJS
├── .env.example               # Exemplo de variáveis de ambiente
├── cardapio.example.json      # Exemplo de cardápio
├── package.json               # Dependências
└── INSTALL.md                 # Este arquivo
```

### Arquivos que **NÃO SÃO** versionados (dados do cliente):

```
├── .env                       # Configurações sensíveis
├── cardapio.json              # Cardápio do restaurante
├── server/
│   ├── db.sqlite              # Banco de dados (pedidos, clientes)
│   ├── custom-settings.json   # Configurações visuais
│   ├── uploads/               # Imagens de produtos
│   ├── whatsapp-sessions/     # Sessão do WhatsApp
│   └── config/
│       └── delivery.config.js # Configurações de entrega
```

---

## ⚙️ Configurações Detalhadas

### Variáveis de Ambiente (.env)

| Variável | Descrição | Obrigatório |
|----------|-----------|:-----------:|
| `PORT` | Porta do servidor (padrão: 3005) | Não |
| `RESTAURANT_NAME` | Nome do restaurante | Sim |
| `APP_DOMAIN` | Domínio para links de pedido | Sim |
| `RESTAURANT_LATITUDE` | Latitude do restaurante | Sim |
| `RESTAURANT_LONGITUDE` | Longitude do restaurante | Sim |
| `ORS_API_KEY` | Chave da API OpenRouteService | Sim |
| `WHATSAPP_GROUP_ID` | ID do grupo de entregas | Sim |
| `JWT_SECRET` | Chave para tokens JWT | Sim (produção) |

### Cardápio (cardapio.json)

O cardápio deve seguir este formato:

```json
{
  "restaurante": "Nome do Restaurante",
  "contato": "(00) 0 0000-0000",
  "categorias": [
    {
      "nome": "Lanches",
      "itens": [
        {
          "nome": "X-Burguer",
          "preco": 15.00,
          "descricao": "Pão, hambúrguer, queijo"
        }
      ]
    }
  ]
}
```

### Configuração de Entrega (server/config/delivery.config.js)

```javascript
export const deliveryConfig = {
  restaurantCoordinates: {
    lat: -25.4284,
    lng: -49.2733
  },
  pricingRules: [
    { maxDistance: 4, price: 7.00 },
    { maxDistance: 10, price: 15.00 }
  ],
  maxDeliveryDistance: 20
};
```

---

## 🔄 Atualizando o Código

Para atualizar o sistema mantendo os dados do cliente:

```bash
# 1. Faça backup dos dados (opcional, mas recomendado)
cp -r server/uploads server/uploads.backup
cp server/db.sqlite server/db.sqlite.backup

# 2. Atualize o código
git pull origin main

# 3. Atualize dependências
npm install
cd server && npm install && cd ..

# 4. Reinicie o servidor
pm2 restart all  # ou seu método de reiniciar
```

Os arquivos de dados (banco, uploads, configurações) **não são afetados** pelo git pull.

---

## 🐳 Deploy com PM2

Para produção, recomendamos usar PM2:

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar o servidor
cd server
pm2 start server.js --name "restaurante"

# Configurar para iniciar no boot
pm2 startup
pm2 save
```

---

## 📱 Configurando WhatsApp

1. Acesse `/admin.html` no navegador
2. Vá na seção "WhatsApp"
3. Escaneie o QR Code com o WhatsApp do restaurante
4. Após conectar, acesse `/api/whatsapp/groups` para ver os grupos
5. Copie o ID do grupo de entregas e coloque no `.env`

---

## 🔧 Solução de Problemas

### Erro: "SQLITE_CANTOPEN"
O banco de dados não existe ou não tem permissão. Verifique se o diretório `server/` tem permissão de escrita.

### Erro: "ORS_API_KEY não configurada"
Configure a chave da API OpenRouteService no arquivo `.env`.

### WhatsApp desconecta frequentemente
Isso pode acontecer se:
- O WhatsApp Web está aberto em outro dispositivo
- A sessão expirou (delete a pasta `server/whatsapp-sessions` e reconecte)

### Imagens não carregam
Verifique se a pasta `server/uploads` existe e tem permissão de escrita.

---

## 📞 Suporte

Para dúvidas ou problemas, entre em contato com o desenvolvedor.

---

**Versão:** 2.0  
**Última atualização:** Dezembro 2025
