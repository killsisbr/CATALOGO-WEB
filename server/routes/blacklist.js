import express from 'express';

const router = express.Router();

// Exporta uma função que recebe o db
export default function (db) {

    // Listar blacklist
    router.get('/', async (req, res) => {
        try {
            const lista = await db.all('SELECT * FROM blacklist ORDER BY data_inclusao DESC');
            res.json({ success: true, lista });
        } catch (error) {
            console.error('Erro ao buscar blacklist:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar blacklist' });
        }
    });

    // Adicionar telefone à blacklist
    router.post('/', async (req, res) => {
        try {
            const { telefone, motivo } = req.body;

            if (!telefone) {
                return res.status(400).json({ success: false, error: 'Telefone é obrigatório' });
            }

            // Verificar se já existe
            const existe = await db.get('SELECT * FROM blacklist WHERE telefone = ?', [telefone]);
            if (existe) {
                return res.status(400).json({ success: false, error: 'Telefone já está na blacklist' });
            }

            const result = await db.run(
                'INSERT INTO blacklist (telefone, motivo, data_inclusao) VALUES (?, ?, datetime("now"))',
                [telefone, motivo || 'Não especificado']
            );

            console.log(`Telefone adicionado à blacklist: ${telefone}`);
            res.json({ success: true, id: result.lastID });
        } catch (error) {
            console.error('Erro ao adicionar à blacklist:', error);
            res.status(500).json({ success: false, error: 'Erro ao adicionar à blacklist' });
        }
    });

    // Remover da blacklist
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            await db.run('DELETE FROM blacklist WHERE id = ?', [id]);
            console.log(`Telefone removido da blacklist: ${id}`);
            res.json({ success: true });
        } catch (error) {
            console.error('Erro ao remover da blacklist:', error);
            res.status(500).json({ success: false, error: 'Erro ao remover da blacklist' });
        }
    });

    return router;
}
