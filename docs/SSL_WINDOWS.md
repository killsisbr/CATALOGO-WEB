# Configuração de SSL com Let's Encrypt no Windows - BrutusWeb

## 🛡️ Segurança com HTTPS no Windows

Este documento fornece instruções detalhadas para configurar SSL/TLS usando Let's Encrypt para o sistema BrutusWeb em ambiente Windows.

## 📋 Pré-requisitos

Antes de começar, você precisa ter:

1. **Domínio registrado** e apontado para o IP do seu servidor
2. **Portas 80 e 443** liberadas no firewall
3. **Windows Server** ou Windows 10/11 com IIS (Internet Information Services)
4. **Certbot para Windows** instalado

## 🚀 Método 1: Usando Certbot para Windows

### Passo 1: Instalar Certbot para Windows

1. Baixe o Certbot para Windows em: https://dl.eff.org/certbot-beta-installer-win32.exe
2. Execute o instalador como administrador
3. Siga as instruções do instalador

### Passo 2: Obter Certificado SSL

Abra o Prompt de Comando como Administrador e execute:

```cmd
# Obter certificado usando o desafio HTTP
certbot certonly --webroot -w C:\inetpub\wwwroot -d seu-dominio.com

# Ou usando o standalone (se não tiver um servidor web rodando)
certbot certonly --standalone -d seu-dominio.com
```

### Passo 3: Configurar Renovação Automática

```cmd
# Testar processo de renovação
certbot renew --dry-run

# Configurar tarefa agendada no Windows
# Abra o Agendador de Tarefas (Task Scheduler)
# Crie uma nova tarefa básica:
# Nome: Renovação Certificado Let's Encrypt
# Disparador: Diariamente
# Ação: Iniciar um programa
# Programa: certbot
# Argumentos: renew --quiet
```

## 🔧 Método 2: Usando IIS como Servidor Web

### Passo 1: Instalar IIS

1. Abra o Painel de Controle
2. Vá para Programas > Ativar ou desativar recursos do Windows
3. Marque "Serviços de Informações da Internet (IIS)"
4. Clique em OK e reinicie se necessário

### Passo 2: Configurar Site no IIS

1. Abra o Gerenciador do IIS (inetmgr)
2. Crie um novo site ou use o site padrão
3. Configure o caminho para apontar para a pasta `public` do projeto
4. Configure as portas 80 e 443

### Passo 3: Instalar Certificado SSL

```cmd
# Usar Certbot com IIS
certbot --installer iis -d seu-dominio.com
```

## 🔒 Configurações de Segurança Adicionais

### Configurar Headers de Segurança no IIS

1. Instale o módulo URL Rewrite para IIS
2. Adicione estas regras ao web.config:

```xml
<system.webServer>
  <httpProtocol>
    <customHeaders>
      <add name="X-Frame-Options" value="SAMEORIGIN" />
      <add name="X-XSS-Protection" value="1; mode=block" />
      <add name="X-Content-Type-Options" value="nosniff" />
      <add name="Referrer-Policy" value="no-referrer-when-downgrade" />
    </customHeaders>
  </httpProtocol>
</system.webServer>
```

### Configurar Redirecionamento HTTP para HTTPS

Adicione esta regra ao web.config:

```xml
<system.webServer>
  <rewrite>
    <rules>
      <rule name="Redirect to HTTPS" stopProcessing="true">
        <match url="(.*)" />
        <conditions>
          <add input="{HTTPS}" pattern="off" ignoreCase="true" />
        </conditions>
        <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
      </rule>
    </rules>
  </rewrite>
</system.webServer>
```

## 🔄 Renovação de Certificados

### Verificar Status dos Certificados

```cmd
# Listar certificados
certbot certificates

# Verificar datas de expiração
certbot certificates --cert-name seu-dominio.com
```

### Forçar Renovação

```cmd
# Renovar todos os certificados
certbot renew

# Renovar um certificado específico
certbot renew --cert-name seu-dominio.com
```

## 🚨 Troubleshooting

### Problemas Comuns

1. **Erro de validação do domínio**
   ```cmd
   # Verificar se o domínio aponta para o IP correto
   nslookup seu-dominio.com
   
   # Verificar se as portas estão liberadas
   netstat -an | findstr "80\|443"
   ```

2. **Erro de rate limit do Let's Encrypt**
   ```cmd
   # Usar staging server para testes
   certbot certonly --test-cert --webroot -w C:\inetpub\wwwroot -d seu-dominio.com
   ```

3. **Problemas com renovação automática**
   ```cmd
   # Verificar logs do certbot
   type %HOMEPATH%\AppData\Roaming\letsencrypt\letsencrypt.log
   ```

4. **Erros de configuração do IIS**
   ```cmd
   # Verificar logs do IIS
   type C:\inetpub\logs\LogFiles\W3SVC1\*.log
   ```

## 📊 Monitoramento

### Verificar Expiração dos Certificados

```cmd
# Script simples para verificar expiração
certbot certificates | findstr "VALID"
```

### Configurar Alertas

Crie um script batch para verificar a expiração e enviar alertas por email:

```batch
@echo off
certbot certificates | findstr "VALID" > cert_status.txt
if %ERRORLEVEL% EQU 0 (
    echo Certificado valido
) else (
    echo Problema com certificado - enviar alerta
    # Adicione aqui o comando para enviar email
)
```

## 🛠️ Ferramentas Úteis

### Testar Configuração SSL

1. **SSL Labs Test**
   - Acesse: https://www.ssllabs.com/ssltest/
   - Digite seu domínio para análise completa

2. **Teste local com OpenSSL**
   ```cmd
   openssl s_client -connect seu-dominio.com:443
   ```

## 📈 Melhores Práticas

### Configuração Recomendada do IIS

1. **Habilitar HTTP/2** no IIS
2. **Configurar Ciphers Seguros** usando o IIS Crypto
3. **Habilitar HSTS** (HTTP Strict Transport Security)

### Configuração do web.config Completa

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <httpProtocol>
      <customHeaders>
        <add name="X-Frame-Options" value="SAMEORIGIN" />
        <add name="X-XSS-Protection" value="1; mode=block" />
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="Referrer-Policy" value="no-referrer-when-downgrade" />
        <add name="Strict-Transport-Security" value="max-age=31536000; includeSubDomains" />
      </customHeaders>
    </httpProtocol>
    
    <rewrite>
      <rules>
        <rule name="Redirect to HTTPS" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="off" ignoreCase="true" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
        </rule>
      </rules>
    </rewrite>
    
    <staticContent>
      <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="7.00:00:00" />
    </staticContent>
  </system.webServer>
</configuration>
```

## 📞 Suporte

Para suporte adicional com Let's Encrypt no Windows:
- Documentação oficial: https://letsencrypt.org/docs/
- Community Forum: https://community.letsencrypt.org/
- Certbot Documentation: https://eff-certbot.readthedocs.io/
- IIS Documentation: https://docs.microsoft.com/en-us/iis/