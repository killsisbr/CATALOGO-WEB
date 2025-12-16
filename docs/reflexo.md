# Reflexo do Sistema BrutusWeb

## Visão Geral

O sistema BrutusWeb é uma solução completa de pedidos online para restaurantes, com foco especial em delivery. Ele combina um frontend responsivo otimizado para dispositivos móveis com um backend robusto em Node.js, além de funcionalidades avançadas como integração com WhatsApp, cálculo automático de entregas e impressão em impressoras térmicas.

## Arquitetura do Sistema

### Backend (Node.js/Express)
- Servidor principal em `server/server.js`
- Banco de dados SQLite para armazenamento
- API REST completa para gerenciamento de produtos, pedidos e clientes
- Integração com WhatsApp através da biblioteca whatsapp-web.js
- Sistema de cálculo de entregas com integração à API OpenRouteService

### Frontend
- Interface mobile-first otimizada para dispositivos móveis
- Páginas para clientes fazerem pedidos
- Painel administrativo para gerenciamento de produtos
- Dashboard com estatísticas e relatórios
- Quadro de pedidos para acompanhamento em tempo real

### Banco de Dados
- SQLite como banco de dados principal
- Estrutura de tabelas para produtos, pedidos, itens de pedido e clientes
- Migrações automáticas para adicionar novas colunas

## Funcionalidades Principais

### 1. Sistema de Pedidos
- Navegação por categorias de produtos
- Visualização de informações detalhadas dos produtos
- Adição/remoção de itens no carrinho
- Edição de quantidades diretamente no carrinho
- Finalização de pedidos com coleta de informações do cliente

### 2. Gestão de Produtos
- CRUD completo para produtos (criar, ler, atualizar, excluir)
- Upload de imagens para produtos
- Categorização de produtos
- Edição de informações (nome, descrição, preço)

### 3. Integração com WhatsApp
- Vinculação do WhatsApp do restaurante através de QR Code
- Envio automático de resumo de pedidos para clientes
- Envio de pedidos para grupo de entregas
- Sistema de comandos para interação com clientes

### 4. Sistema de Entregas
- Cálculo automático de distância usando OpenRouteService
- Determinação do valor da entrega com base em regras configuráveis
- Verificação se o endereço está na área de entrega
- Integração com geolocalização do cliente

### 5. Impressão Térmica
- Formatação otimizada para impressoras térmicas de 80mm
- Preview de impressão antes da impressão real
- Suporte a formatação específica para cupons térmicos

### 6. Personalização
- Configuração de cores, logo e informações do restaurante
- Temas claro e escuro
- Informações de contato e PIX

### 7. Dashboard e Relatórios
- Estatísticas gerais de pedidos
- Produtos mais vendidos
- Melhores clientes
- Valores de entrega
- Visualização em gráficos e tabelas

### 8. Quadro de Pedidos
- Visualização de pedidos em colunas por status
- Atualização automática de pedidos
- Detalhamento de pedidos
- Atualização de status dos pedidos
- Impressão de pedidos

## Componentes Técnicos

### Estrutura de Pastas
```
.
├── public/                 # Frontend (HTML, CSS, JS)
├── server/                 # Backend (Node.js)
│   ├── config/             # Configurações
│   ├── helpers/            # Funções auxiliares
│   ├── services/           # Serviços (delivery, WhatsApp)
│   └── views/              # Templates EJS
├── cardapio.json           # Cardápio completo
└── README.md               # Documentação
```

### Tecnologias Utilizadas
- **Frontend**: HTML5, CSS3, JavaScript ES6+, Font Awesome
- **Backend**: Node.js, Express.js, SQLite3
- **Bibliotecas**: whatsapp-web.js, axios, chart.js, leaflet
- **Autenticação**: LocalAuth para WhatsApp
- **APIs Externas**: OpenRouteService (geolocalização e rotas)

## Fluxo de Funcionamento

1. **Cliente acessa o sistema** através do link de pedidos
2. **Navega pelos produtos** organizados por categorias
3. **Adiciona itens ao carrinho** com possibilidade de observações
4. **Finaliza o pedido** fornecendo informações pessoais
5. **Calcula entrega** através de geolocalização ou endereço digitado
6. **Confirma o pedido** e recebe número de confirmação
7. **Sistema envia notificações** via WhatsApp para cliente e grupo de entregas
8. **Restaurante acompanha pedidos** através do quadro de pedidos
9. **Atualiza status dos pedidos** conforme progresso
10. **Imprime cupom** para entrega ao cliente

## Características Especiais

### Design Responsivo
- Interface otimizada para dispositivos móveis
- Experiência de usuário intuitiva e fluida
- Carrossel de produtos com navegação por toque

### Sistema de Cores Personalizável
- Configuração de cores primárias, secundárias e de fundo
- Preview em tempo real das alterações
- Suporte a temas claro e escuro

### Gestão de Imagens
- Upload de imagens para produtos
- Posicionamento e zoom das imagens
- Placeholder automático para produtos sem imagem

### Segurança e Privacidade
- Coordenadas dos clientes armazenadas temporariamente apenas para cálculo
- Não compartilhamento de dados com terceiros
- Exclusão automática após processamento do pedido

## Melhorias Implementadas

### Interface Mobile
- Design responsivo otimizado para dispositivos móveis
- Navegação por categorias
- Carrinho acessível através de ícone no cabeçalho

### Funcionalidades do Carrinho
- Adição/remoção de itens
- Edição de quantidades diretamente no carrinho
- Cálculo automático do total
- Contador de itens no ícone do carrinho

### Processo de Finalização
- Formulário completo para coleta de dados do cliente
- Seleção de forma de pagamento
- Geração de número de pedido
- Confirmação visual do pedido

### Backend
- Estrutura de banco de dados expandida para suportar pedidos
- API REST para manipulação de produtos e pedidos
- Integração automática com o cardápio completo

## Considerações Finais

O sistema BrutusWeb representa uma solução completa e profissional para restaurantes que desejam oferecer um serviço de pedidos online eficiente. Com sua interface intuitiva, funcionalidades avançadas e integração com tecnologias modernas como WhatsApp e impressoras térmicas, ele proporciona uma experiência premium tanto para os clientes quanto para os administradores do restaurante.

A arquitetura modular e bem documentada facilita a manutenção e evolução do sistema, enquanto as práticas de segurança garantem a proteção dos dados dos clientes. A combinação de tecnologias modernas com uma interface pensada para a experiência do usuário faz do BrutusWeb uma solução robusta e escalável para o mercado de delivery de alimentos.