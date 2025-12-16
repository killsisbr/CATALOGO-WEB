# Sistema de Pedidos BrutusWeb

Este sistema é um site de pedidos para restaurantes, desenvolvido com Node.js, Express e SQLite3. Ele permite ao usuário navegar por produtos em categorias, visualizar informações e preços, adicionar itens ao carrinho e finalizar o pedido.

## Funcionalidades

- Navegação por categorias de produtos
- Exibição de informações: nome, descrição, imagem e preço do produto
- Adicionar ao carrinho: selecione produtos e adicione ao carrinho de compras
- Edição de quantidades no carrinho
- Finalizar pedido: coleta de informações do cliente e geração de número de pedido
- Backend com Express e banco de dados SQLite3
- Design responsivo otimizado para dispositivos móveis

## Estrutura do Projeto

- `server/` — Código do backend (Node.js, Express, SQLite3)
  - `server.js` — Servidor principal
  - `popular_db.js` — Script para popular o banco de dados com o cardápio completo
- `public/` — Frontend (HTML, CSS, JS)
  - `index.html` — Página principal (interface mobile)
  - `style.css` — Estilos visuais responsivos
  - `script.js` — Lógica do frontend e carrinho
- `cardapio.json` — Cardápio completo do restaurante

## Como rodar

1. Instale as dependências:
   ```sh
   cd server
   npm install
   ```
2. Popule o banco de dados:
   ```sh
   node popular_db.js
   ```
3. Inicie o servidor:
   ```sh
   npm start
   ```
4. Acesse o site em: [http://localhost:3001](http://localhost:3001)

## Personalização

- Para adicionar ou editar produtos, altere o arquivo `cardapio.json` e execute novamente o script de população.
- O frontend pode ser customizado em `public/`.

---

Desenvolvido para facilitar pedidos em restaurantes de forma simples e visual.