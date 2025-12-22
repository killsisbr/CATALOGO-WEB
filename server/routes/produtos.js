import express from 'express';

const router = express.Router();

export default function (db, upload) {

    // Listar produtos
    router.get('/', async (req, res) => {
        try {
            const produtos = await db.all('SELECT * FROM produtos');
            console.log(`GET /api/produtos: returning ${produtos.length} produtos`);
            res.json(produtos);
        } catch (error) {
            console.error('Erro ao buscar produtos:', error);
            res.status(500).json({ error: 'Erro ao buscar produtos' });
        }
    });

    // Criar novo produto
    router.post('/', async (req, res) => {
        try {
            const { nome, descricao, preco, categoria, imagem } = req.body;

            if (!nome || !preco || !categoria) {
                return res.status(400).json({ error: 'Nome, preço e categoria são obrigatórios' });
            }

            const result = await db.run(
                'INSERT INTO produtos (nome, descricao, preco, categoria, imagem) VALUES (?, ?, ?, ?, ?)',
                [nome, descricao || '', preco, categoria, imagem || null]
            );

            const novoProduto = {
                id: result.lastID,
                nome,
                descricao: descricao || '',
                preco,
                categoria,
                imagem: imagem || null
            };

            res.status(201).json({
                success: true,
                message: 'Produto criado com sucesso!',
                produto: novoProduto
            });
        } catch (error) {
            console.error('Erro ao criar produto:', error);
            res.status(500).json({ error: 'Erro ao criar produto' });
        }
    });

    // Atualizar produto
    router.put('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { nome, descricao, preco, categoria } = req.body;

            await db.run(
                'UPDATE produtos SET nome = ?, descricao = ?, preco = ?, categoria = ? WHERE id = ?',
                [nome, descricao, preco, categoria, id]
            );

            res.json({
                success: true,
                message: 'Produto atualizado com sucesso!'
            });
        } catch (error) {
            console.error('Erro ao atualizar produto:', error);
            res.status(500).json({ error: 'Erro ao atualizar produto' });
        }
    });

    // Excluir produto
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;

            const produto = await db.get('SELECT * FROM produtos WHERE id = ?', [id]);
            if (!produto) {
                return res.status(404).json({ error: 'Produto não encontrado' });
            }

            await db.run('DELETE FROM produtos WHERE id = ?', [id]);

            res.json({
                success: true,
                message: 'Produto excluído com sucesso!'
            });
        } catch (error) {
            console.error('Erro ao excluir produto:', error);
            res.status(500).json({ error: 'Erro ao excluir produto' });
        }
    });

    // Atualizar imagem do produto (URL)
    router.post('/:id/imagem', async (req, res) => {
        try {
            const { id } = req.params;
            const { imagem } = req.body;

            await db.run('UPDATE produtos SET imagem = ? WHERE id = ?', [imagem, id]);

            res.json({
                success: true,
                message: 'Imagem atualizada com sucesso!'
            });
        } catch (error) {
            console.error('Erro ao atualizar imagem:', error);
            res.status(500).json({ error: 'Erro ao atualizar imagem' });
        }
    });

    // Upload de imagem do produto
    router.post('/:id/upload', upload.single('imagem'), async (req, res) => {
        try {
            const { id } = req.params;

            if (!req.file) {
                return res.status(400).json({ error: 'Nenhuma imagem foi enviada' });
            }

            const imagePath = `/uploads/${req.file.filename}`;

            await db.run('UPDATE produtos SET imagem = ? WHERE id = ?', [imagePath, id]);

            res.json({
                success: true,
                imagePath: imagePath,
                message: 'Imagem atualizada com sucesso!'
            });
        } catch (error) {
            console.error('Erro ao fazer upload da imagem:', error);
            res.status(500).json({ error: 'Erro ao fazer upload da imagem' });
        }
    });

    return router;
}
