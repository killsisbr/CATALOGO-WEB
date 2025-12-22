import express from 'express';

const router = express.Router();

// Exporta uma função que recebe o db
export default function (db) {

    // Listar categorias
    router.get('/', async (req, res) => {
        try {
            const categorias = await db.all('SELECT * FROM categorias ORDER BY nome');
            res.json({ success: true, categorias });
        } catch (error) {
            console.error('Erro ao buscar categorias:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar categorias' });
        }
    });

    // Criar categoria
    router.post('/', async (req, res) => {
        try {
            const { nome } = req.body;
            if (!nome || String(nome).trim() === '') {
                return res.status(400).json({ success: false, error: 'Nome inválido' });
            }
            const result = await db.run('INSERT INTO categorias (nome) VALUES (?)', [String(nome).trim()]);
            res.json({ success: true, categoria: { id: result.lastID, nome: String(nome).trim() } });
        } catch (error) {
            console.error('Erro ao criar categoria:', error);
            res.status(500).json({ success: false, error: 'Erro ao criar categoria' });
        }
    });

    // Excluir categoria
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const categoria = await db.get('SELECT * FROM categorias WHERE id = ?', [id]);
            if (!categoria) {
                return res.status(404).json({ success: false, error: 'Categoria não encontrada' });
            }
            // Setar produtos com essa categoria para NULL
            await db.run('UPDATE produtos SET categoria = NULL WHERE categoria = ?', [categoria.nome]);
            await db.run('DELETE FROM categorias WHERE id = ?', [id]);
            res.json({ success: true });
        } catch (error) {
            console.error('Erro ao excluir categoria:', error);
            res.status(500).json({ success: false, error: 'Erro ao excluir categoria' });
        }
    });

    return router;
}
