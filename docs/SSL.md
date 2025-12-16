# Configuração de SSL com Let's Encrypt - BrutusWeb

## 🛡️ Segurança com HTTPS

Este documento fornece instruções detalhadas para configurar SSL/TLS usando Let's Encrypt para o sistema BrutusWeb.

## 📋 Pré-requisitos

Antes de começar, você precisa ter:

1. **Domínio registrado** e apontado para o IP do seu servidor
2. **Portas 80 e 443** liberadas no firewall
3. **Sistema Ubuntu/Debian** com acesso root ou sudo
4. **Nginx instalado** (já incluído no setup.sh)

## 🚀 Método 1: Configuração Automática com Setup Script

O método mais simples é usar o script de setup atualizado:

```bash
# Dar permissão de execução
chmod +x setup.sh

# Executar como root
sudo ./setup.sh
```

Durante a execução, o script irá solicitar o domínio para configuração do SSL.

## 🔧 Método 2: Configuração Manual

### Passo 1: Instalar Certbot

```bash
# Atualizar sistema
sudo apt update

# Instalar Certbot e plugin do Nginx
sudo apt install certbot python3-certbot-nginx
```

### Passo 2: Configurar Nginx

Certifique-se de que seu arquivo de configuração do Nginx está correto:

```bash
sudo nano /etc/nginx/sites-available/brutusweb
```

Conteúdo recomendado:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name seu-dominio.com;

    ssl_certificate /etc/letsencrypt/live/seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

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
```

### Passo 3: Obter Certificado SSL

```bash
# Criar diretório para desafios do certbot
sudo mkdir -p /var/www/certbot
sudo chown www-data:www-data /var/www/certbot

# Testar configuração do Nginx
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx

# Obter certificado usando o desafio HTTP
sudo certbot --nginx --agree-tos --email seu-email@dominio.com -d seu-dominio.com
```

### Passo 4: Configurar Renovação Automática

```bash
# Testar processo de renovação
sudo certbot renew --dry-run

# Configurar renovação automática com cron
sudo crontab -e

# Adicionar esta linha para renovar todos os dias às 12:00
0 12 * * * /usr/bin/certbot renew --quiet
```

## 🔒 Configurações de Segurança Adicionais

### Configurar Headers de Segurança

Adicione estas linhas ao bloco server HTTPS no arquivo do Nginx:

```nginx
# Headers de segurança
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
```

### Configurar Diffie-Hellman Parameters

```bash
# Gerar parâmetros DH mais seguros
sudo openssl dhparam -out /etc/nginx/dhparam.pem 2048

# Adicionar ao bloco server HTTPS
ssl_dhparam /etc/nginx/dhparam.pem;
```

## 🔄 Renovação de Certificados

### Verificar Status dos Certificados

```bash
# Listar certificados
sudo certbot certificates

# Verificar datas de expiração
echo | openssl s_client -connect seu-dominio.com:443 2>/dev/null | openssl x509 -noout -dates
```

### Forçar Renovação

```bash
# Renovar todos os certificados
sudo certbot renew

# Renovar um certificado específico
sudo certbot renew --cert-name seu-dominio.com

# Renovar com verbose
sudo certbot renew --verbose
```

## 🚨 Troubleshooting

### Problemas Comuns

1. **Erro de validação do domínio**
   ```bash
   # Verificar se o domínio aponta para o IP correto
   nslookup seu-dominio.com
   
   # Verificar se as portas estão liberadas
   sudo ufw status
   ```

2. **Erro de rate limit do Let's Encrypt**
   ```bash
   # Usar staging server para testes
   sudo certbot --test-cert --nginx -d seu-dominio.com
   ```

3. **Problemas com renovação automática**
   ```bash
   # Verificar logs do cron
   sudo tail -f /var/log/syslog | grep CRON
   
   # Verificar logs do certbot
   sudo tail -f /var/log/letsencrypt/letsencrypt.log
   ```

4. **Erros de configuração do Nginx**
   ```bash
   # Testar configuração
   sudo nginx -t
   
   # Verificar logs
   sudo tail -f /var/log/nginx/error.log
   ```

## 📊 Monitoramento

### Verificar Expiração dos Certificados

```bash
# Script simples para verificar expiração
#!/bin/bash
DOMAIN="seu-dominio.com"
EXPIRY_DATE=$(echo | openssl s_client -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
echo "Certificado expira em: $EXPIRY_DATE"
```

### Configurar Alertas

Adicione ao crontab para alertas por email:

```bash
# Verificar expiração semanalmente
0 9 * * 1 /usr/local/bin/check-cert-expiry.sh | mail -s "Certificado SSL" seu-email@dominio.com
```

## 🛠️ Ferramentas Úteis

### Testar Configuração SSL

1. **SSL Labs Test**
   - Acesse: https://www.ssllabs.com/ssltest/
   - Digite seu domínio para análise completa

2. **Teste local com OpenSSL**
   ```bash
   openssl s_client -connect seu-dominio.com:443
   ```

3. **Verificar cadeia de certificados**
   ```bash
   openssl s_client -connect seu-dominio.com:443 -showcerts
   ```

## 📈 Melhores Práticas

### Configuração Recomendada do Nginx

```nginx
server {
    listen 80;
    server_name seu-dominio.com;
    
    # Redirecionar todo tráfego HTTP para HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name seu-dominio.com;
    
    # Configuração SSL
    ssl_certificate /etc/letsencrypt/live/seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com/privkey.pem;
    
    # Configurações de segurança recomendadas
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # Headers de segurança
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    # Configuração do proxy
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
```

## 📞 Suporte

Para suporte adicional com Let's Encrypt:
- Documentação oficial: https://letsencrypt.org/docs/
- Community Forum: https://community.letsencrypt.org/
- Certbot Documentation: https://eff-certbot.readthedocs.io/