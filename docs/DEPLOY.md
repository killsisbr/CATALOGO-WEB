# Deploy em Produção - BrutusWeb

## 🚀 Guia Completo de Implantação

Este documento fornece instruções detalhadas para implantar o sistema BrutusWeb em um ambiente de produção.

## 📋 Requisitos do Servidor

### Sistema Operacional
- Ubuntu 20.04 LTS ou superior
- Debian 10 ou superior
- CentOS 8 ou superior

### Recursos Mínimos Recomendados
- **CPU**: 1 núcleo
- **RAM**: 1 GB
- **Disco**: 10 GB livres
- **Banda**: 10 Mbps

### Portas Necessárias
- **80/TCP**: HTTP (se usar Nginx)
- **443/TCP**: HTTPS (se usar SSL)
- **3005/TCP**: Porta da aplicação (pode ser alterada)

## 🛠️ Métodos de Deploy

### 1. Deploy Automatizado com Script

O método mais simples é usar o script de setup fornecido:

```bash
# Dar permissão de execução
chmod +x setup.sh

# Executar como root
sudo ./setup.sh
```

O script irá:
1. Instalar todas as dependências
2. Configurar o ambiente Node.js
3. Criar usuário dedicado para a aplicação
4. Instalar e configurar PM2 para gerenciamento de processos
5. Configurar Nginx como proxy reverso (opcional)
6. Configurar SSL com Let's Encrypt (opcional)
7. Configurar firewall básico

### 2. Deploy Manual

#### Passo 1: Instalar Dependências

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PM2
sudo npm install -g pm2

# Instalar Nginx (opcional)
sudo apt install -y nginx
```

#### Passo 2: Configurar Aplicação

```bash
# Criar usuário dedicado
sudo useradd -m -s /bin/bash brutusweb

# Copiar arquivos da aplicação
sudo mkdir -p /home/brutusweb/app
sudo cp -r /caminho/para/seus/arquivos/* /home/brutusweb/app/

# Definir permissões
sudo chown -R brutusweb:brutusweb /home/brutusweb/app

# Instalar dependências
cd /home/brutusweb/app/server
sudo -u brutusweb npm install

# Popular banco de dados
sudo -u brutusweb node popular_db.js
```

#### Passo 3: Configurar PM2

```bash
# Iniciar aplicação com PM2
sudo -u brutusweb pm2 start /home/brutusweb/app/ecosystem.config.js

# Salvar configuração
sudo -u brutusweb pm2 save

# Configurar inicialização automática
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u brutusweb --hp /home/brutusweb
```

#### Passo 4: Configurar Nginx (Opcional)

```bash
# Criar arquivo de configuração
sudo nano /etc/nginx/sites-available/brutusweb

# Conteúdo:
server {
    listen 80;
    server_name seu-dominio.com;

    location / {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Habilitar site
sudo ln -s /etc/nginx/sites-available/brutusweb /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 🔧 Configurações de Ambiente

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```bash
# Porta do servidor
PORT=3005

# Ambiente
NODE_ENV=production

# Configurações de segurança (se aplicável)
SESSION_SECRET=sua-senha-secreta-aqui
```

### Configuração do Banco de Dados

O sistema usa SQLite3 por padrão. Para ambientes de alta disponibilidade, considere migrar para PostgreSQL ou MySQL.

## 🔒 Segurança

### 1. Firewall

Configure o firewall para permitir apenas portas necessárias:

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw --force enable
```

### 2. SSL/TLS

Configure HTTPS com Let's Encrypt. Consulte o guia detalhado em [SSL.md](SSL.md):

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx

# Obter certificado
sudo certbot --nginx -d seu-dominio.com

# Renovar automaticamente
sudo crontab -e
# Adicionar: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 3. Permissões de Arquivos

```bash
# Diretórios sensíveis
sudo chown -R brutusweb:brutusweb /home/brutusweb/app/server/db.sqlite
sudo chmod 600 /home/brutusweb/app/server/db.sqlite

# Arquivos de configuração
sudo chmod 600 /home/brutusweb/app/.env
```

## 📊 Monitoramento

### Logs

PM2 gerencia automaticamente os logs:

```bash
# Ver logs em tempo real
pm2 logs brutusweb

# Ver logs específicos
pm2 logs brutusweb --lines 100

# Logs de erro
pm2 logs brutusweb --err
```

### Monitoramento de Recursos

```bash
# Monitorar processos
pm2 monit

# Ver status
pm2 status

# Ver informações detalhadas
pm2 show brutusweb
```

## 🔄 Atualizações

### Atualizar Código

```bash
# Parar aplicação
pm2 stop brutusweb

# Atualizar código (git pull ou copiar novos arquivos)
cd /home/brutusweb/app
# git pull origin main
# OU
# cp -r /caminho/novos/arquivos/* /home/brutusweb/app/

# Instalar novas dependências
cd /home/brutusweb/app/server
sudo -u brutusweb npm install

# Reiniciar aplicação
pm2 restart brutusweb
```

### Atualizar Dependências do Sistema

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Atualizar Node.js
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Atualizar PM2
sudo npm update -g pm2
```

## 🚨 Troubleshooting

### Problemas Comuns

1. **Aplicação não inicia**
   ```bash
   # Verificar logs
   pm2 logs brutusweb
   
   # Verificar status
   pm2 status
   
   # Tentar reiniciar
   pm2 restart brutusweb
   ```

2. **Porta já em uso**
   ```bash
   # Verificar processo usando a porta
   sudo lsof -i :3005
   
   # Matar processo
   sudo kill -9 <PID>
   ```

3. **Problemas com banco de dados**
   ```bash
   # Verificar permissões
   ls -la /home/brutusweb/app/server/db.sqlite
   
   # Repopular banco (ATENÇÃO: isso apagará os dados)
   cd /home/brutusweb/app/server
   sudo -u brutusweb node popular_db.js
   ```

4. **Nginx não responde**
   ```bash
   # Verificar status
   sudo systemctl status nginx
   
   # Verificar configuração
   sudo nginx -t
   
   # Reiniciar serviço
   sudo systemctl restart nginx
   ```

5. **Problemas com SSL**
   ```bash
   # Verificar certificados
   sudo certbot certificates
   
   # Testar renovação
   sudo certbot renew --dry-run
   
   # Verificar logs
   sudo tail -f /var/log/letsencrypt/letsencrypt.log
   ```

## 📈 Backup

### Backup do Banco de Dados

```bash
# Criar backup diário
sudo crontab -e
# Adicionar: 0 2 * * * cp /home/brutusweb/app/server/db.sqlite /home/brutusweb/backups/db_$(date +\%Y\%m\%d).sqlite

# Criar diretório de backups
sudo mkdir -p /home/brutusweb/backups
sudo chown brutusweb:brutusweb /home/brutusweb/backups
```

### Backup do Código

```bash
# Se usar Git
cd /home/brutusweb/app
git add .
git commit -m "Backup $(date)"
git push origin main
```

## 📞 Suporte

Para suporte adicional, consulte:
- Documentação oficial do Node.js
- Documentação do PM2
- Documentação do Nginx
- Documentação do Let's Encrypt
- Comunidade do Express.js

Para informações detalhadas sobre configuração de SSL, consulte [SSL.md](SSL.md).