# 📱 Guia de Manutenção do WhatsApp

## Problema: WhatsApp Desconectando em Loop

### Sintomas
- QR Code aparece
- Você escaneia
- Conecta por alguns segundos
- Desconecta automaticamente
- Gera novo QR Code
- Repete o ciclo

### Causa
Incompatibilidade entre `whatsapp-web.js` e WhatsApp Web atual

---

## 🔧 Solução Automática (Recomendada)

### Via Script de Manutenção

```bash
cd ~/killsis/CATALOGO-WEB/server
bash whatsapp-maintenance.sh
```

O script irá:
1. ✅ Atualizar `whatsapp-web.js`
2. ✅ Limpar sessões corrompidas
3. ✅ Reiniciar o serviço PM2
4. ✅ Verificar status

### Opções do Script

```bash
# Manutenção completa (padrão)
bash whatsapp-maintenance.sh full

# Apenas atualizar dependências
bash whatsapp-maintenance.sh update

# Apenas limpar sessões
bash whatsapp-maintenance.sh clean

# Apenas reiniciar serviço
bash whatsapp-maintenance.sh restart

# Verificar status
bash whatsapp-maintenance.sh status
```

---

## 🛠️ Solução Manual

### Passo 1: Atualizar Dependências

```bash
cd ~/killsis/CATALOGO-WEB/server
npm install whatsapp-web.js@latest
```

### Passo 2: Limpar Sessões

```bash
rm -rf whatsapp-sessions
```

### Passo 3: Reiniciar Serviço

```bash
pm2 restart 0
```

### Passo 4: Verificar Logs

```bash
pm2 logs 0 --lines 50
```

---

## 📊 Verificação de Status

### Ver logs em tempo real

```bash
pm2 logs 0
```

### Ver apenas erros

```bash
pm2 logs 0 --err
```

### Ver status dos processos

```bash
pm2 status
```

---

## ⚠️ Avisos no Log (Normais)

Estes erros são **normais** e não afetam o funcionamento:

```
Falha ao obter contato via getContact() — usando fallback
window.Store.ContactMethods.getIsMyContact is not a function
```

**Por quê?**
- O WhatsApp Web muda APIs constantemente
- O código já trata com fallback
- Mensagens de grupo são ignoradas corretamente

---

## ✅ Como Saber se Está Funcionando

### Logs Positivos

```
Cliente do WhatsApp pronto!
```

### Teste de Funcionamento

1. Envie "oi" para o número do WhatsApp (do seu celular)
2. Deve receber mensagem automática com link
3. Verifique logs para confirmar recebimento

---

## 🚨 Problemas Persistentes

Se após manutenção completa ainda não funcionar:

### 1. Verificar versão do Node.js

```bash
node --version
```

Requer: Node.js 16+ ou 18+

### 2. Instalar Chrome/Chromium

```bash
# Debian/Ubuntu
sudo apt-get update
sudo apt-get install chromium-browser

# CentOS/RHEL
sudo yum install chromium
```

### 3. Dependências do Puppeteer

```bash
sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils
```

### 4. Reinstalação Completa

```bash
cd ~/killsis/CATALOGO-WEB/server
rm -rf node_modules package-lock.json
npm install
pm2 restart 0
```

---

## 📞 Suporte

Se nenhuma solução funcionar:

1. Salve os logs: `pm2 logs 0 --lines 100 > whatsapp-error.log`
2. Envie para análise
3. Verifique se o número do WhatsApp está ativo

---

## 🔄 Rotina de Manutenção Preventiva

Execute semanalmente:

```bash
cd ~/killsis/CATALOGO-WEB/server
bash whatsapp-maintenance.sh full
```

Isso previne:
- ❌ Sessões corrompidas
- ❌ Incompatibilidades de versão
- ❌ Problemas de memória

---

## 📝 Notas Importantes

1. **Sempre escaneie o QR Code COMPLETAMENTE**
   - Espere o WhatsApp confirmar no celular
   - Não feche o app durante o scan

2. **Não clique em "Forçar novo QR"**
   - Deixe o sistema gerar automaticamente
   - Só escaneie quando aparecer

3. **Conexão estável é essencial**
   - Servidor precisa ter internet estável
   - Firewall pode bloquear conexões

4. **Um número = Uma sessão**
   - Não use o mesmo número em múltiplos servidores
   - Desconecte de outros lugares primeiro
