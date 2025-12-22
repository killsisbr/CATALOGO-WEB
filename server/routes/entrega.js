import express from 'express';

const router = express.Router();

export default function (deliveryService) {

    // Calcular valor da entrega por coordenadas
    router.post('/calcular', async (req, res) => {
        try {
            const { latitude, longitude } = req.body;

            const result = await deliveryService.processDelivery({
                lat: parseFloat(latitude),
                lng: parseFloat(longitude)
            });

            res.json(result);
        } catch (error) {
            console.error('Erro ao calcular entrega:', error);
            res.status(500).json({
                error: 'Erro ao calcular valor da entrega'
            });
        }
    });

    // Converter endereço em coordenadas
    router.post('/endereco-coordenadas', async (req, res) => {
        try {
            const { endereco } = req.body;

            if (!endereco) {
                return res.status(400).json({
                    success: false,
                    error: 'Endereço não informado'
                });
            }

            const coordinates = await deliveryService.converterEnderecoEmCoordenadas(endereco);

            if (!coordinates) {
                return res.status(400).json({
                    success: false,
                    error: 'Não foi possível encontrar as coordenadas para o endereço informado.'
                });
            }

            // Verificar se está em Imbituva
            const cidadeValida = await deliveryService.verificarSeEstaEmImbituva(coordinates.lat, coordinates.lng);

            if (!cidadeValida) {
                return res.status(400).json({
                    success: false,
                    error: "Atendemos apenas em Imbituva! Sua localização não está em Imbituva, PR."
                });
            }

            res.json({
                success: true,
                coordinates: coordinates
            });
        } catch (error) {
            console.error('Erro ao converter endereço em coordenadas:', error);
            res.status(500).json({
                success: false,
                error: 'Erro ao processar o endereço. Por favor, tente novamente.'
            });
        }
    });

    // Calcular taxa de entrega com base no endereço
    router.post('/calcular-taxa', async (req, res) => {
        try {
            const { endereco } = req.body;

            if (!endereco) {
                return res.status(400).json({
                    success: false,
                    error: 'Endereço não informado'
                });
            }

            const result = await deliveryService.calcularTaxaPorEndereco(endereco);
            res.json(result);
        } catch (error) {
            console.error('Erro ao calcular taxa de entrega:', error);
            res.status(500).json({
                success: false,
                error: 'Erro ao calcular taxa de entrega. Por favor, tente novamente.'
            });
        }
    });

    return router;
}
