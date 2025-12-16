# Sistema de Entrega e Localização

## Visão Geral

Este módulo permite que os clientes calculem automaticamente o valor da entrega com base na localização. O sistema utiliza a API do Google Maps para calcular a distância entre o restaurante e o cliente, e aplica regras de precificação configuráveis.

## Configuração Inicial

### 1. Configurar variáveis de ambiente

Copie o arquivo `.env.example` para `.env` e preencha as variáveis:

```bash
cp .env.example .env
```

Edite o arquivo `.env` e adicione sua chave da API do Google Maps:

```env
# Chave da API do Google Maps (obrigatória para cálculo preciso)
GOOGLE_MAPS_API_KEY=SuaChaveDaApiAqui

# Coordenadas do restaurante (opcional - pode usar as padrão)
RESTAURANT_LATITUDE=-25.4284
RESTAURANT_LONGITUDE=-49.2733
```

### 2. Obter chave da API do Google Maps

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione um existente
3. Ative as seguintes APIs:
   - Distance Matrix API
   - Geocoding API
4. Crie uma chave de API
5. Restrinja a chave para apenas as APIs necessárias (opcional mas recomendado)

### 3. Configurar coordenadas do restaurante

As coordenadas do restaurante podem ser configuradas de duas formas:

1. **Via variáveis de ambiente** (recomendado):
   ```env
   RESTAURANT_LATITUDE=-25.4284
   RESTAURANT_LONGITUDE=-49.2733
   ```

2. **Via arquivo de configuração**:
   Edite `server/config/delivery.config.js`:
   ```javascript
   export const deliveryConfig = {
     restaurantCoordinates: {
       lat: -25.4284, // Latitude do restaurante
       lng: -49.2733  // Longitude do restaurante
     },
     // ... outras configurações
   };
   ```

## Regras de Precificação

As regras de precificação estão configuradas em `server/config/delivery.config.js`:

```javascript
pricingRules: [
  { maxDistance: 4, price: 7.00 },     // Até 4km: R$ 7,00
  { maxDistance: 10, price: 15.00 },   // Até 10km: R$ 15,00
  { maxDistance: 20, price: 25.00 },   // Até 20km: R$ 25,00
  { maxDistance: 70, price: 65.00 }    // Até 70km: R$ 65,00 (valor máximo)
],
```

## Funcionamento

### No Website

1. O cliente acessa a página de pedidos
2. Preenche suas informações
3. Clica no botão "Usar minha localização"
4. O navegador solicita permissão para acessar a localização
5. O sistema calcula a distância e o valor da entrega
6. O valor é adicionado automaticamente ao total do pedido

### Cálculo por Endereço Digitado

1. O cliente digita o endereço completo no campo apropriado
2. Ao sair do campo (evento blur), o sistema:
   - Converte automaticamente o endereço em coordenadas geográficas
   - Verifica se o endereço está na área de entrega (Imbituva)
   - Calcula a distância entre o restaurante e o endereço do cliente
   - Determina o valor da entrega com base nas regras de precificação
   - Atualiza o total do pedido com o valor da entrega

### Via WhatsApp (futuro)

O sistema está preparado para processar localizações enviadas via WhatsApp, mas esta funcionalidade ainda será implementada.

## Testes

### Teste sem chave da API

Se não houver chave da API configurada, o sistema usará um cálculo aproximado baseado na fórmula de Haversine. Este cálculo é menos preciso mas funcional para testes.

### Teste com coordenadas conhecidas

Você pode testar com coordenadas conhecidas para verificar se o cálculo está correto:

- Curitiba, PR: `-25.4284, -49.2733`
- São Paulo, SP: `-23.5505, -46.6333`

## Solução de Problemas

## Segurança

- As coordenadas dos clientes são armazenadas temporariamente apenas para cálculo
- Não são compartilhadas com terceiros
- São excluídas após o processamento do pedido