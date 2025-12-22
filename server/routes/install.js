import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

export default function (db) {

    // Página de instalação
    router.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '..', '..', 'public', 'install.html'));
    });

    // Verificar status da instalação
    router.get('/status', (req, res) => {
        try {
            const settingsPath = path.join(__dirname, '..', 'custom-settings.json');
            const envPath = path.join(__dirname, '..', '..', '.env');
            const deliveryConfigPath = path.join(__dirname, '..', 'config', 'delivery.config.js');

            const installed = fs.existsSync(settingsPath) || fs.existsSync(envPath);

            let settings = null;
            let env = {};
            let deliveryConfig = null;

            if (fs.existsSync(settingsPath)) {
                try {
                    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                } catch (e) { /* ignorar */ }
            }

            env = {
                PORT: process.env.PORT || '3005',
                ORS_API_KEY: process.env.ORS_API_KEY || '',
                RESTAURANT_LATITUDE: process.env.RESTAURANT_LATITUDE || '',
                RESTAURANT_LONGITUDE: process.env.RESTAURANT_LONGITUDE || '',
                WHATSAPP_GROUP_ID: process.env.WHATSAPP_GROUP_ID || '',
                APP_DOMAIN: process.env.APP_DOMAIN || '',
                RESTAURANT_NAME: process.env.RESTAURANT_NAME || ''
            };

            if (fs.existsSync(deliveryConfigPath)) {
                try {
                    const content = fs.readFileSync(deliveryConfigPath, 'utf8');
                    const latMatch = content.match(/lat:\s*([-\d.]+)/);
                    const lngMatch = content.match(/lng:\s*([-\d.]+)/);
                    const rulesMatch = content.match(/pricingRules:\s*\[([\s\S]*?)\]/);
                    let pricingRules = [];
                    if (rulesMatch) {
                        const rulesStr = rulesMatch[1];
                        const ruleMatches = rulesStr.matchAll(/\{\s*maxDistance:\s*([\d.]+),\s*price:\s*([\d.]+)\s*\}/g);
                        for (const m of ruleMatches) {
                            pricingRules.push({ maxDistance: parseFloat(m[1]), price: parseFloat(m[2]) });
                        }
                    }
                    const maxDistMatch = content.match(/maxDeliveryDistance:\s*([\d.]+)/);

                    deliveryConfig = {
                        restaurantCoordinates: { lat: latMatch ? parseFloat(latMatch[1]) : null, lng: lngMatch ? parseFloat(lngMatch[1]) : null },
                        pricingRules,
                        maxDeliveryDistance: maxDistMatch ? parseFloat(maxDistMatch[1]) : 70
                    };
                } catch (e) {
                    console.warn('Erro ao ler config de entrega:', e.message);
                }
            }

            res.json({ installed, settings, env, deliveryConfig });
        } catch (error) {
            console.error('Erro ao verificar instalação:', error);
            res.status(500).json({ error: 'Erro ao verificar instalação' });
        }
    });

    // Salvar configuração de entrega
    router.post('/delivery-config', (req, res) => {
        try {
            const { latitude, longitude, maxDistance, pricingRules } = req.body;

            const configDir = path.join(__dirname, '..', 'config');
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            const rulesStr = pricingRules.map(r =>
                `    { maxDistance: ${r.maxDistance}, price: ${r.price.toFixed(2)} }`
            ).join(',\n');

            const configContent = `// Configuração do sistema de entrega
// Gerado automaticamente pela página de instalação em ${new Date().toISOString()}
export const deliveryConfig = {
  restaurantCoordinates: {
    lat: ${latitude || -25.4284},
    lng: ${longitude || -49.2733}
  },
  pricingRules: [
${rulesStr}
  ],
  maxDeliveryDistance: ${maxDistance || 70},
  outOfRangeMessage: "Desculpe, mas você está fora da nossa área de entrega (máximo de ${maxDistance || 70}km)."
};
`;

            const configPath = path.join(configDir, 'delivery.config.js');
            fs.writeFileSync(configPath, configContent);

            console.log('Configuração de entrega salva com sucesso');
            res.json({ success: true, message: 'Configuração de entrega salva com sucesso!' });
        } catch (error) {
            console.error('Erro ao salvar configuração de entrega:', error);
            res.status(500).json({ error: 'Erro ao salvar configuração de entrega' });
        }
    });

    // Salvar cardápio
    router.post('/cardapio', async (req, res) => {
        try {
            const cardapio = req.body;
            const cardapioPath = path.join(__dirname, '..', '..', 'cardapio.json');
            fs.writeFileSync(cardapioPath, JSON.stringify(cardapio, null, 2));

            if (db) {
                const produtosExistentes = await db.get('SELECT COUNT(*) as count FROM produtos');
                if (produtosExistentes.count === 0 && cardapio.categorias) {
                    for (const categoria of cardapio.categorias) {
                        try {
                            await db.run('INSERT OR IGNORE INTO categorias (nome) VALUES (?)', [categoria.nome]);
                        } catch (e) { /* ignorar */ }

                        for (const item of categoria.itens) {
                            await db.run(
                                'INSERT INTO produtos (nome, descricao, preco, categoria) VALUES (?, ?, ?, ?)',
                                [item.nome, item.descricao || '', item.preco, categoria.nome]
                            );
                        }
                    }
                    console.log('Cardápio importado para o banco de dados');
                }
            }

            console.log('Cardápio salvo com sucesso');
            res.json({ success: true, message: 'Cardápio salvo com sucesso!' });
        } catch (error) {
            console.error('Erro ao salvar cardápio:', error);
            res.status(500).json({ error: 'Erro ao salvar cardápio' });
        }
    });

    // Salvar variáveis de ambiente
    router.post('/env-config', (req, res) => {
        try {
            const envVars = req.body;
            const envPath = path.join(__dirname, '..', '..', '.env');

            let envContent = '';
            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
            }

            const updateEnvVar = (content, key, value) => {
                if (!value && value !== 0) return content;
                const regex = new RegExp(`^${key}=.*$`, 'm');
                const newLine = `${key}=${value}`;
                if (regex.test(content)) {
                    return content.replace(regex, newLine);
                } else {
                    return content + (content.endsWith('\n') ? '' : '\n') + newLine + '\n';
                }
            };

            Object.entries(envVars).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    envContent = updateEnvVar(envContent, key, value);
                }
            });

            if (!envContent.includes('# Arquivo de configuração')) {
                envContent = `# Arquivo de configuração de variáveis de ambiente
# Gerado/atualizado pela página de instalação em ${new Date().toISOString()}

` + envContent;
            }

            fs.writeFileSync(envPath, envContent);
            dotenv.config({ path: envPath, override: true });

            console.log('Variáveis de ambiente salvas com sucesso');
            res.json({ success: true, message: 'Variáveis de ambiente salvas com sucesso!', note: 'Algumas alterações podem requerer reinício do servidor.' });
        } catch (error) {
            console.error('Erro ao salvar variáveis de ambiente:', error);
            res.status(500).json({ error: 'Erro ao salvar variáveis de ambiente' });
        }
    });

    return router;
}
