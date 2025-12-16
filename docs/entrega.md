# Sistema de Entrega e Localização

## Visão Geral
Este documento descreve o plano para implementar um sistema de entrega com cálculo de distância e valor baseado na localização do cliente. O sistema permitirá que os clientes enviem sua localização via WhatsApp ou através da página web, e o sistema calculará automaticamente o valor da entrega com base na distância.

## ✅ STATUS: IMPLEMENTAÇÃO CONCLUÍDA (Fase Web)

A implementação do sistema de entrega via web está concluída. A integração com WhatsApp será implementada em uma fase futura.

## Funcionalidades Implementadas

### 1. Coleta de Localização
- ✅ Permitir que clientes enviem sua localização via web
- ✅ Integrar com a API de Geolocalização do navegador
- ✅ Interface amigável com botão "Usar minha localização"

### 2. Cálculo de Distância
- ✅ Utilizar a API do Google Maps para calcular distância entre restaurante e cliente
- ✅ Fallback para cálculo aproximado quando não há chave da API
- ✅ Implementar algoritmo de cálculo de valor de entrega baseado na distância

### 3. Interface do Usuário
- ✅ Adicionar botão "Usar minha localização" no formulário de endereço
- ✅ Exibir distância calculada e valor da entrega
- ✅ Feedback visual para erros e carregamento

### 4. Integração com Sistema de Pedidos
- ✅ Valor da entrega adicionado automaticamente ao total do pedido
- ✅ Coordenadas armazenadas com o pedido
- ✅ Distância e valor da entrega salvos no banco de dados

## Funcionalidades Planejadas (Fase WhatsApp)

### Integração com WhatsApp
- ⬜ Permitir que clientes enviem localização pelo WhatsApp
- ⬜ Processar mensagens de localização recebidas
- ⬜ Integrar com o sistema de pedidos existente

## Arquitetura do Sistema

### Backend
```
services/delivery-service.js - Serviço responsável por:
  - Calcular distâncias usando Google Maps API
  - Determinar valor de entrega com base em regras configuráveis
  - Processar localizações recebidas via web
  - Integrar com o sistema de pedidos existente
```

### Frontend
```
public/entrega.js - Scripts para:
  - Coletar localização do navegador
  - Enviar coordenadas para o backend
  - Exibir informações de entrega no formulário
  - Integrar com a interface existente
```

### Banco de Dados
```
Tabela pedidos com colunas adicionadas:
  - distancia REAL
  - valor_entrega REAL
  - coordenadas_cliente TEXT
```

## Regras de Negócio

### Cálculo de Valor de Entrega
- Até 2km: R$ 5,00
- De 2km a 5km: R$ 8,00
- De 5km a 10km: R$ 12,00
- Acima de 10km: R$ 15,00 + R$ 1,00 por km adicional

### Limites Geográficos
- Área de entrega máxima: 20km do restaurante
- Fora desta área, mostrar mensagem "Entrega não disponível"

## Configuração

### Google Maps API
1. Obter chave da API do Google Maps
2. Ativar Distance Matrix API
3. Configurar chave no arquivo `.env`

### Coordenadas do Restaurante
- Configuráveis via variáveis de ambiente ou arquivo de configuração

## Testes Realizados

✅ Teste de coleta de localização via navegador
✅ Teste de cálculo de distância com Google Maps API
✅ Teste de cálculo aproximado sem API
✅ Teste de integração com formulário de pedidos
✅ Teste de salvamento de informações no banco de dados
✅ Teste de diferentes cenários de erro

## Como Usar

### Para Clientes
1. Acessar a página de pedidos
2. Preencher informações pessoais
3. Clicar no botão "Usar minha localização"
4. Permitir acesso à localização quando solicitado
5. Ver o valor da entrega calculado automaticamente
6. Finalizar o pedido normalmente

### Para Administradores
1. Configurar chave da API do Google Maps no `.env`
2. Ajustar coordenadas do restaurante se necessário
3. Personalizar regras de precificação em `config/delivery.config.js`

## Considerações de Segurança e Privacidade

✅ Solicitar permissão explícita do usuário antes de acessar localização
✅ Armazenar coordenadas de forma segura apenas durante o processamento
✅ Não compartilhar dados de localização com terceiros
✅ Coordenadas são armazenadas temporariamente e associadas apenas ao pedido

## Próximos Passos

1. Implementar processamento de localizações do WhatsApp
2. Adicionar mapa visual na interface (opcional)
3. Implementar geocodificação reversa (converter coordenadas em endereço)
4. Adicionar suporte a múltiplos pontos de entrega