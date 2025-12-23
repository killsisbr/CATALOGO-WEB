#!/bin/bash

# Script de Manutenção do WhatsApp
# Autor: Lucas Larocca (killsis)
# Uso: bash whatsapp-maintenance.sh [opcao]

COLOR_GREEN='\033[0;32m'
COLOR_RED='\033[0;31m'
COLOR_YELLOW='\033[1;33m'
COLOR_BLUE='\033[0;34m'
COLOR_RESET='\033[0m'

echo -e "${COLOR_BLUE}╔═══════════════════════════════════════════╗${COLOR_RESET}"
echo -e "${COLOR_BLUE}║   WhatsApp Maintenance Script v1.0       ║${COLOR_RESET}"
echo -e "${COLOR_BLUE}╚═══════════════════════════════════════════╝${COLOR_RESET}"
echo ""

# Função para atualizar dependências
update_dependencies() {
    echo -e "${COLOR_YELLOW}📦 Atualizando dependências do WhatsApp...${COLOR_RESET}"
    npm install whatsapp-web.js@latest
    
    if [ $? -eq 0 ]; then
        echo -e "${COLOR_GREEN}✅ Dependências atualizadas com sucesso!${COLOR_RESET}"
        return 0
    else
        echo -e "${COLOR_RED}❌ Erro ao atualizar dependências${COLOR_RESET}"
        return 1
    fi
}

# Função para limpar sessões
clean_sessions() {
    echo -e "${COLOR_YELLOW}🗑️  Limpando sessões antigas...${COLOR_RESET}"
    
    if [ -d "whatsapp-sessions" ]; then
        rm -rf whatsapp-sessions
        echo -e "${COLOR_GREEN}✅ Sessões limpas!${COLOR_RESET}"
    else
        echo -e "${COLOR_BLUE}ℹ️  Nenhuma sessão encontrada${COLOR_RESET}"
    fi
}

# Função para reiniciar serviço
restart_service() {
    echo -e "${COLOR_YELLOW}🔄 Reiniciando serviço...${COLOR_RESET}"
    
    # Verifica se está usando PM2
    if command -v pm2 &> /dev/null; then
        pm2 restart 0
        echo -e "${COLOR_GREEN}✅ Serviço reiniciado via PM2${COLOR_RESET}"
    else
        echo -e "${COLOR_BLUE}ℹ️  PM2 não encontrado - reinicie manualmente${COLOR_RESET}"
    fi
}

# Função para verificar status
check_status() {
    echo -e "${COLOR_YELLOW}📊 Verificando status...${COLOR_RESET}"
    
    if command -v pm2 &> /dev/null; then
        pm2 list
    else
        echo -e "${COLOR_BLUE}ℹ️  Use node server.js para iniciar manualmente${COLOR_RESET}"
    fi
}

# Função principal
full_maintenance() {
    echo -e "${COLOR_BLUE}🔧 Iniciando manutenção completa...${COLOR_RESET}"
    echo ""
    
    update_dependencies
    echo ""
    
    clean_sessions
    echo ""
    
    restart_service
    echo ""
    
    sleep 2
    
    check_status
    echo ""
    
    echo -e "${COLOR_GREEN}✨ Manutenção concluída!${COLOR_RESET}"
    echo -e "${COLOR_YELLOW}📱 Aguarde alguns segundos e escaneie o novo QR Code${COLOR_RESET}"
}

# Menu principal
case "$1" in
    update)
        update_dependencies
        ;;
    clean)
        clean_sessions
        ;;
    restart)
        restart_service
        ;;
    status)
        check_status
        ;;
    full|"")
        full_maintenance
        ;;
    *)
        echo -e "${COLOR_BLUE}Uso: $0 [opcao]${COLOR_RESET}"
        echo ""
        echo "Opções:"
        echo "  full     - Manutenção completa (padrão)"
        echo "  update   - Atualizar apenas dependências"
        echo "  clean    - Limpar apenas sessões"
        echo "  restart  - Reiniciar apenas serviço"
        echo "  status   - Verificar status"
        echo ""
        echo "Exemplo: bash whatsapp-maintenance.sh full"
        exit 1
        ;;
esac

exit 0
