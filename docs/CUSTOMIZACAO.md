# 🎨 Sistema de Customização - BrutusWeb

## ✅ Implementações Concluídas

### 1. **Página de Customização (`/custom.html`)**
- ✅ Interface completa para personalização
- ✅ Seções organizadas:
  - Informações Básicas (Nome e Contato)
  - Cores (Primária, Secundária, Background)
  - Informações PIX (Chave e Titular)
  - Logo do Restaurante
  - Tema (Claro/Escuro)
- ✅ Preview em tempo real das alterações
- ✅ Botão "Salvar Configurações"
- ✅ Botão "Restaurar Padrão" (vermelho)

### 2. **Sistema de Cores**
- ✅ Seletor de cores visual (color picker)
- ✅ Campo de texto para código HEX
- ✅ Sincronização entre picker e campo de texto
- ✅ Validação de formato HEX
- ✅ Aplicação automática no preview

### 3. **Preview em Tempo Real**
- ✅ Card de produto exemplo
- ✅ Atualização instantânea das cores
- ✅ Nome do restaurante no header
- ✅ Botão de adicionar ao carrinho com cor primária
- ✅ Efeitos hover com cores personalizadas

### 4. **Backend (API)**
- ✅ `GET /api/custom-settings` - Carregar configurações
- ✅ `POST /api/custom-settings` - Salvar configurações
- ✅ `POST /api/custom-settings/reset` - Restaurar padrão
- ✅ Persistência em arquivo JSON (`custom-settings.json`)
- ✅ Configurações padrão caso arquivo não exista

### 5. **Aplicação na Página de Pedidos**
- ✅ Script `apply-custom-settings.js` criado
- ✅ Carregamento automático das configurações
- ✅ Aplicação de cores via CSS Variables:
  - `--primary-color`
  - `--secondary-color`
  - `--bg-dark`
- ✅ Atualização do nome do restaurante no header
- ✅ Suporte para logo (se configurado)
- ✅ Cores derivadas (claras e escuras)
- ✅ Console logs para debug

### 6. **Configurações Padrão**
```json
{
  "restaurantName": "Brutus Burger",
  "contact": "(42) 9 99830-2047",
  "primaryColor": "#27ae60",
  "secondaryColor": "#f39c12",
  "backgroundColor": "#121212",
  "pixKey": "",
  "pixName": "",
  "logo": null,
  "theme": "dark"
}
```

## 🎯 Como Funciona

### Fluxo de Customização:
1. Admin acessa `/custom.html`
2. Altera cores, nome, logo, etc.
3. Preview atualiza em tempo real
4. Clica em "Salvar Configurações"
5. Configurações são salvas em `custom-settings.json`
6. Usuário acessa `/pedido.html`
7. Script `apply-custom-settings.js` carrega automaticamente
8. Cores e informações são aplicadas via CSS Variables
9. Página reflete as customizações

### Restaurar Padrão:
1. Admin clica em "Restaurar Padrão"
2. Confirmação de segurança
3. Backend reseta o arquivo para valores padrão
4. Interface recarrega com configurações originais

## 📁 Arquivos Modificados/Criados

### Criados:
- ✅ `public/apply-custom-settings.js` - Script de aplicação
- ✅ `CUSTOMIZACAO.md` - Esta documentação

### Modificados:
- ✅ `public/custom.html` - Adicionado botão reset
- ✅ `public/custom.js` - Função de reset e melhorias
- ✅ `public/pedido.html` - Inclusão do script apply-custom-settings.js
- ✅ `server/server.js` - Endpoint de reset
- ✅ `public/style.css` - Estilos para customização

## 🔧 Variáveis CSS Utilizadas

O sistema utiliza CSS Variables que são aplicadas dinamicamente:

```css
:root {
  --primary-color: #27ae60;    /* Cor principal */
  --secondary-color: #f39c12;  /* Cor secundária */
  --bg-dark: #121212;          /* Fundo escuro */
  --primary-color-light: ...   /* Calculada automaticamente */
  --primary-color-dark: ...    /* Calculada automaticamente */
}
```

Todos os componentes que usam essas variáveis serão automaticamente atualizados:
- Botões
- Headers
- Gradientes
- Bordas
- Ícones ativos
- Scrollbars
- Checkboxes
- Etc.

## 🚀 Testando o Sistema

### 1. Acessar página de customização:
```
http://localhost:3005/custom.html
```

### 2. Alterar cores e salvar

### 3. Acessar página de pedidos:
```
http://localhost:3005/pedido.html
```

### 4. Verificar no Console do navegador:
```
🎨 Iniciando aplicação de configurações customizadas...
📋 Configurações customizadas carregadas: {...}
✅ Cor primária aplicada: #27ae60
✅ Cor secundária aplicada: #f39c12
✅ Cor de fundo aplicada: #121212
✅ Nome do restaurante aplicado: Brutus Burger
✅ Todas as configurações customizadas foram aplicadas!
```

## 💡 Recursos Adicionais Possíveis

### Futuras Melhorias:
- [ ] Upload de logo para servidor (atualmente base64)
- [ ] Múltiplos temas predefinidos
- [ ] Customização de fontes
- [ ] Preview mobile/desktop separados
- [ ] Histórico de configurações
- [ ] Exportar/Importar configurações
- [ ] Modo escuro/claro completo

## 🐛 Debug

Se as cores não aparecerem:
1. Verificar console do navegador
2. Confirmar que `apply-custom-settings.js` foi carregado
3. Verificar se `custom-settings.json` existe no servidor
4. Testar endpoint: `http://localhost:3005/api/custom-settings`

## 📱 Compatibilidade

- ✅ Desktop
- ✅ Mobile
- ✅ Tablet
- ✅ Todos os navegadores modernos (Chrome, Firefox, Safari, Edge)

---

**Desenvolvido para BrutusWeb v2** 🍔

## ⚙️ Variáveis de Ambiente (`.env`)

Você pode configurar o domínio do aplicativo e o nome do restaurante diretamente no arquivo `.env` na raiz do projeto:

- `APP_DOMAIN` — domínio público onde o app é hospedado (ex: brutusburger.online). Usado para montar links de pedido nas mensagens do WhatsApp.
- `RESTAURANT_NAME` — nome do restaurante mostrado no site, nas mensagens e nas impressões.

Exemplo:
```dotenv
APP_DOMAIN=brutusburger.online
RESTAURANT_NAME="Brutus Burger"
```

OBS: As configurações internas do `/api/custom-settings` ainda prevalecem quando salvas via painel, mas `RESTAURANT_NAME` no `.env` sobrepõe o nome exibido caso esteja definido.
