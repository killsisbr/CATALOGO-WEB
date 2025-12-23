import express from 'express';

const router = express.Router();

// Lista de clientes SSE conectados
const sseClients = new Set();

// Função para notificar todos os clientes conectados
export function notifyClients(eventType, data) {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(client => {
        try {
            client.write(message);
        } catch (e) {
            console.error('Erro ao enviar SSE:', e);
            sseClients.delete(client);
        }
    });
    console.log(`[SSE] Notificado ${sseClients.size} clientes sobre: ${eventType}`);
}

// Endpoint SSE para receber atualizações em tempo real
router.get('/stream', (req, res) => {
    // Configurar headers para SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Para nginx
    res.flushHeaders();

    // Enviar heartbeat inicial
    res.write('event: connected\ndata: {"status":"connected"}\n\n');

    // Adicionar cliente à lista
    sseClients.add(res);
    console.log(`[SSE] Cliente conectado. Total: ${sseClients.size}`);

    // Heartbeat a cada 30 segundos para manter conexão viva
    const heartbeat = setInterval(() => {
        try {
            res.write('event: heartbeat\ndata: {"time":"' + new Date().toISOString() + '"}\n\n');
        } catch (e) {
            clearInterval(heartbeat);
        }
    }, 30000);

    // Remover cliente quando desconectar
    req.on('close', () => {
        clearInterval(heartbeat);
        sseClients.delete(res);
        console.log(`[SSE] Cliente desconectado. Total: ${sseClients.size}`);
    });
});

// Endpoint manual para testar notificação
router.post('/notify', (req, res) => {
    const { event, data } = req.body;
    notifyClients(event || 'test', data || { message: 'Test notification' });
    res.json({ success: true, clientsNotified: sseClients.size });
});

export default router;
