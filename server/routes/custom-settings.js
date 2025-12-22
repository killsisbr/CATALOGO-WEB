import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Obter configurações de personalização
router.get('/', (req, res) => {
    try {
        const settingsPath = path.join(__dirname, '..', 'custom-settings.json');

        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            settings.restaurantName = process.env.RESTAURANT_NAME || settings.restaurantName || 'Brutus Burger';
            if (process.env.APP_DOMAIN && !settings.domain) settings.domain = process.env.APP_DOMAIN;
            if (settings.pickupEnabled === undefined) settings.pickupEnabled = true;
            res.json(settings);
        } else {
            res.json({
                restaurantName: process.env.RESTAURANT_NAME || 'Brutus Burger',
                contact: '(42) 9 99830-2047',
                primaryColor: '#27ae60',
                secondaryColor: '#f39c12',
                backgroundColor: '#121212',
                hours: '18:00 às 23:00',
                pixKey: '',
                pixName: '',
                logo: null,
                theme: 'dark',
                domain: process.env.APP_DOMAIN || undefined,
                pickupEnabled: true
            });
        }
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
        res.status(500).json({ error: 'Erro ao carregar configurações' });
    }
});

// Salvar configurações de personalização
router.post('/', async (req, res) => {
    try {
        const settings = req.body;
        const settingsPath = path.join(__dirname, '..', 'custom-settings.json');
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        res.json({
            success: true,
            message: 'Configurações salvas com sucesso!'
        });
    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        res.status(500).json({ error: 'Erro ao salvar configurações' });
    }
});

// Resetar configurações para o padrão
router.post('/reset', (req, res) => {
    try {
        const settingsPath = path.join(__dirname, '..', 'custom-settings.json');

        const defaultSettings = {
            restaurantName: process.env.RESTAURANT_NAME || 'Brutus Burger',
            contact: '(42) 9 99830-2047',
            primaryColor: '#27ae60',
            hours: '18:00 às 23:00',
            secondaryColor: '#f39c12',
            backgroundColor: '#121212',
            pixKey: '',
            pixName: '',
            logo: null,
            theme: 'dark'
        };

        if (process.env.APP_DOMAIN) defaultSettings.domain = process.env.APP_DOMAIN;
        fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));

        res.json({
            success: true,
            message: 'Configurações restauradas para o padrão!',
            settings: defaultSettings
        });
    } catch (error) {
        console.error('Erro ao resetar configurações:', error);
        res.status(500).json({ error: 'Erro ao resetar configurações' });
    }
});

export default router;
