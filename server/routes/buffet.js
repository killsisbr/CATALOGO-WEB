import express from 'express';

const router = express.Router();

export default function (db) {

    // Listar itens do buffet (apenas ativos)
    router.get('/', async (req, res) => {
        try {
            const itens = await db.all('SELECT * FROM buffet_dia WHERE ativo = 1 ORDER BY nome');
            res.json({ success: true, itens });
        } catch (error) {
            console.error('Erro ao buscar buffet:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar itens do buffet' });
        }
    });

    // Listar todos os itens do buffet (incluindo inativos) - para admin
    router.get('/todos', async (req, res) => {
        try {
            const itens = await db.all('SELECT * FROM buffet_dia ORDER BY ativo DESC, nome');
            res.json({ success: true, itens });
        } catch (error) {
            console.error('Erro ao buscar todos os itens do buffet:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar itens do buffet' });
        }
    });

    // Adicionar item ao buffet
    router.post('/', async (req, res) => {
        try {
            const { nome } = req.body;
            if (!nome || String(nome).trim() === '') {
                return res.status(400).json({ success: false, error: 'Nome do item é obrigatório' });
            }
            const result = await db.run('INSERT INTO buffet_dia (nome, ativo) VALUES (?, 1)', [String(nome).trim()]);
            res.json({ success: true, item: { id: result.lastID, nome: String(nome).trim(), ativo: 1 } });
        } catch (error) {
            console.error('Erro ao adicionar item ao buffet:', error);
            res.status(500).json({ success: false, error: 'Erro ao adicionar item ao buffet' });
        }
    });

    // Atualizar item do buffet
    router.put('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { nome, ativo } = req.body;

            const item = await db.get('SELECT * FROM buffet_dia WHERE id = ?', [id]);
            if (!item) {
                return res.status(404).json({ success: false, error: 'Item não encontrado' });
            }

            const novoNome = nome !== undefined ? String(nome).trim() : item.nome;
            const novoAtivo = ativo !== undefined ? (ativo ? 1 : 0) : item.ativo;

            await db.run('UPDATE buffet_dia SET nome = ?, ativo = ? WHERE id = ?', [novoNome, novoAtivo, id]);
            res.json({ success: true, item: { id: parseInt(id), nome: novoNome, ativo: novoAtivo } });
        } catch (error) {
            console.error('Erro ao atualizar item do buffet:', error);
            res.status(500).json({ success: false, error: 'Erro ao atualizar item do buffet' });
        }
    });

    // Toggle ativo/inativo do item do buffet
    router.patch('/:id/toggle', async (req, res) => {
        try {
            const { id } = req.params;
            const item = await db.get('SELECT * FROM buffet_dia WHERE id = ?', [id]);
            if (!item) {
                return res.status(404).json({ success: false, error: 'Item não encontrado' });
            }

            const novoAtivo = item.ativo ? 0 : 1;
            await db.run('UPDATE buffet_dia SET ativo = ? WHERE id = ?', [novoAtivo, id]);
            res.json({ success: true, item: { ...item, ativo: novoAtivo } });
        } catch (error) {
            console.error('Erro ao alternar status do item:', error);
            res.status(500).json({ success: false, error: 'Erro ao alternar status do item' });
        }
    });

    // Remover item do buffet
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const item = await db.get('SELECT * FROM buffet_dia WHERE id = ?', [id]);
            if (!item) {
                return res.status(404).json({ success: false, error: 'Item não encontrado' });
            }

            await db.run('DELETE FROM buffet_dia WHERE id = ?', [id]);
            res.json({ success: true });
        } catch (error) {
            console.error('Erro ao remover item do buffet:', error);
            res.status(500).json({ success: false, error: 'Erro ao remover item do buffet' });
        }
    });

    return router;
}
