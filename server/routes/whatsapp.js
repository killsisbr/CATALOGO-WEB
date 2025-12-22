import express from 'express';

const router = express.Router();

// Exporta uma função que recebe whatsappService e robotEnabled como closure
export default function (getWhatsappService, getRobotEnabled, setRobotEnabled) {

    // Status do WhatsApp
    router.get('/status', async (req, res) => {
        try {
            const whatsappService = getWhatsappService();
            if (!whatsappService) {
                return res.json({
                    connected: false,
                    qrCodeAvailable: false,
                    message: 'Serviço WhatsApp não inicializado'
                });
            }

            const isConnected = whatsappService.isConnected || false;
            const hasQr = whatsappService.qrCode ? true : false;

            res.json({
                connected: isConnected,
                qrCodeAvailable: hasQr,
                message: isConnected ? 'Conectado' : 'Desconectado'
            });
        } catch (error) {
            console.error('Erro ao verificar status WhatsApp:', error);
            res.json({ connected: false, qrCodeAvailable: false, error: error.message });
        }
    });

    // QR Code do WhatsApp
    router.get('/qrcode', async (req, res) => {
        try {
            const whatsappService = getWhatsappService();
            if (!whatsappService || !whatsappService.qrCode) {
                return res.json({
                    available: false,
                    message: 'QR Code não disponível'
                });
            }

            res.json({
                available: true,
                dataUrl: whatsappService.qrCode
            });
        } catch (error) {
            console.error('Erro ao obter QR code:', error);
            res.json({ available: false, error: error.message });
        }
    });

    return router;
}

// Rota para status do robô (separada)
export function createRobotRoutes(getRobotEnabled, setRobotEnabled) {
    const robotRouter = express.Router();

    // Status do robô
    robotRouter.get('/status', (req, res) => {
        res.json({
            success: true,
            enabled: getRobotEnabled()
        });
    });

    // Toggle robô
    robotRouter.post('/toggle', (req, res) => {
        try {
            const { enabled } = req.body;
            setRobotEnabled(enabled === true);

            console.log(`🤖 Robô ${getRobotEnabled() ? 'LIGADO' : 'DESLIGADO'}`);

            res.json({
                success: true,
                enabled: getRobotEnabled(),
                message: getRobotEnabled() ? 'Robô ativado' : 'Robô desativado'
            });
        } catch (error) {
            console.error('Erro ao alternar robô:', error);
            res.status(500).json({
                success: false,
                error: 'Erro ao alternar status do robô'
            });
        }
    });

    return robotRouter;
}
