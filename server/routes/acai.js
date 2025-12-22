import express from 'express';

const router = express.Router();

export default function (db) {

    // ============= TAMANHOS =============

    // Listar tamanhos ativos
    router.get('/tamanhos', async (req, res) => {
        try {
            const tamanhos = await db.all('SELECT * FROM acai_tamanhos WHERE ativo = 1 ORDER BY ordem, nome');
            res.json({ success: true, tamanhos });
        } catch (error) {
            console.error('Erro ao buscar tamanhos de açaí:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar tamanhos' });
        }
    });

    // Listar todos os tamanhos (admin)
    router.get('/tamanhos/todos', async (req, res) => {
        try {
            const tamanhos = await db.all('SELECT * FROM acai_tamanhos ORDER BY ativo DESC, ordem, nome');
            res.json({ success: true, tamanhos });
        } catch (error) {
            console.error('Erro ao buscar todos os tamanhos de açaí:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar tamanhos' });
        }
    });

    // Adicionar tamanho
    router.post('/tamanhos', async (req, res) => {
        try {
            const { nome, preco, adicionais_gratis, ordem } = req.body;
            if (!nome || String(nome).trim() === '') {
                return res.status(400).json({ success: false, error: 'Nome do tamanho é obrigatório' });
            }
            if (preco === undefined || isNaN(parseFloat(preco))) {
                return res.status(400).json({ success: false, error: 'Preço é obrigatório' });
            }

            const result = await db.run(
                'INSERT INTO acai_tamanhos (nome, preco, adicionais_gratis, ordem, ativo) VALUES (?, ?, ?, ?, 1)',
                [String(nome).trim(), parseFloat(preco), parseInt(adicionais_gratis) || 0, parseInt(ordem) || 0]
            );

            res.json({
                success: true,
                tamanho: {
                    id: result.lastID,
                    nome: String(nome).trim(),
                    preco: parseFloat(preco),
                    adicionais_gratis: parseInt(adicionais_gratis) || 0,
                    ordem: parseInt(ordem) || 0,
                    ativo: 1
                }
            });
        } catch (error) {
            console.error('Erro ao adicionar tamanho de açaí:', error);
            res.status(500).json({ success: false, error: 'Erro ao adicionar tamanho' });
        }
    });

    // Atualizar tamanho
    router.put('/tamanhos/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { nome, preco, adicionais_gratis, ordem, ativo } = req.body;

            const tamanho = await db.get('SELECT * FROM acai_tamanhos WHERE id = ?', [id]);
            if (!tamanho) {
                return res.status(404).json({ success: false, error: 'Tamanho não encontrado' });
            }

            const novoNome = nome !== undefined ? String(nome).trim() : tamanho.nome;
            const novoPreco = preco !== undefined ? parseFloat(preco) : tamanho.preco;
            const novosAdicionaisGratis = adicionais_gratis !== undefined ? parseInt(adicionais_gratis) : tamanho.adicionais_gratis;
            const novaOrdem = ordem !== undefined ? parseInt(ordem) : tamanho.ordem;
            const novoAtivo = ativo !== undefined ? (ativo ? 1 : 0) : tamanho.ativo;

            await db.run(
                'UPDATE acai_tamanhos SET nome = ?, preco = ?, adicionais_gratis = ?, ordem = ?, ativo = ? WHERE id = ?',
                [novoNome, novoPreco, novosAdicionaisGratis, novaOrdem, novoAtivo, id]
            );

            res.json({
                success: true,
                tamanho: { id: parseInt(id), nome: novoNome, preco: novoPreco, adicionais_gratis: novosAdicionaisGratis, ordem: novaOrdem, ativo: novoAtivo }
            });
        } catch (error) {
            console.error('Erro ao atualizar tamanho de açaí:', error);
            res.status(500).json({ success: false, error: 'Erro ao atualizar tamanho' });
        }
    });

    // Toggle tamanho
    router.patch('/tamanhos/:id/toggle', async (req, res) => {
        try {
            const { id } = req.params;
            const tamanho = await db.get('SELECT * FROM acai_tamanhos WHERE id = ?', [id]);
            if (!tamanho) {
                return res.status(404).json({ success: false, error: 'Tamanho não encontrado' });
            }

            const novoAtivo = tamanho.ativo ? 0 : 1;
            await db.run('UPDATE acai_tamanhos SET ativo = ? WHERE id = ?', [novoAtivo, id]);
            res.json({ success: true, tamanho: { ...tamanho, ativo: novoAtivo } });
        } catch (error) {
            console.error('Erro ao alternar status do tamanho:', error);
            res.status(500).json({ success: false, error: 'Erro ao alternar status' });
        }
    });

    // Remover tamanho
    router.delete('/tamanhos/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const tamanho = await db.get('SELECT * FROM acai_tamanhos WHERE id = ?', [id]);
            if (!tamanho) {
                return res.status(404).json({ success: false, error: 'Tamanho não encontrado' });
            }

            await db.run('DELETE FROM acai_tamanhos WHERE id = ?', [id]);
            res.json({ success: true });
        } catch (error) {
            console.error('Erro ao remover tamanho de açaí:', error);
            res.status(500).json({ success: false, error: 'Erro ao remover tamanho' });
        }
    });

    // ============= ADICIONAIS =============

    // Listar adicionais ativos
    router.get('/adicionais', async (req, res) => {
        try {
            const adicionais = await db.all('SELECT * FROM acai_adicionais WHERE ativo = 1 ORDER BY categoria, ordem, nome');
            res.json({ success: true, adicionais });
        } catch (error) {
            console.error('Erro ao buscar adicionais de açaí:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar adicionais' });
        }
    });

    // Listar todos os adicionais (admin)
    router.get('/adicionais/todos', async (req, res) => {
        try {
            const adicionais = await db.all('SELECT * FROM acai_adicionais ORDER BY ativo DESC, categoria, ordem, nome');
            res.json({ success: true, adicionais });
        } catch (error) {
            console.error('Erro ao buscar todos os adicionais de açaí:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar adicionais' });
        }
    });

    // Adicionar adicional
    router.post('/adicionais', async (req, res) => {
        try {
            const { nome, preco, categoria, ordem } = req.body;
            if (!nome || String(nome).trim() === '') {
                return res.status(400).json({ success: false, error: 'Nome do adicional é obrigatório' });
            }

            const result = await db.run(
                'INSERT INTO acai_adicionais (nome, preco, categoria, ordem, ativo) VALUES (?, ?, ?, ?, 1)',
                [String(nome).trim(), parseFloat(preco) || 0, String(categoria || 'Geral').trim(), parseInt(ordem) || 0]
            );

            res.json({
                success: true,
                adicional: {
                    id: result.lastID,
                    nome: String(nome).trim(),
                    preco: parseFloat(preco) || 0,
                    categoria: String(categoria || 'Geral').trim(),
                    ordem: parseInt(ordem) || 0,
                    ativo: 1
                }
            });
        } catch (error) {
            console.error('Erro ao adicionar adicional de açaí:', error);
            res.status(500).json({ success: false, error: 'Erro ao adicionar adicional' });
        }
    });

    // Atualizar adicional
    router.put('/adicionais/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { nome, preco, categoria, ordem, ativo } = req.body;

            const adicional = await db.get('SELECT * FROM acai_adicionais WHERE id = ?', [id]);
            if (!adicional) {
                return res.status(404).json({ success: false, error: 'Adicional não encontrado' });
            }

            const novoNome = nome !== undefined ? String(nome).trim() : adicional.nome;
            const novoPreco = preco !== undefined ? parseFloat(preco) : adicional.preco;
            const novaCategoria = categoria !== undefined ? String(categoria).trim() : adicional.categoria;
            const novaOrdem = ordem !== undefined ? parseInt(ordem) : adicional.ordem;
            const novoAtivo = ativo !== undefined ? (ativo ? 1 : 0) : adicional.ativo;

            await db.run(
                'UPDATE acai_adicionais SET nome = ?, preco = ?, categoria = ?, ordem = ?, ativo = ? WHERE id = ?',
                [novoNome, novoPreco, novaCategoria, novaOrdem, novoAtivo, id]
            );

            res.json({
                success: true,
                adicional: { id: parseInt(id), nome: novoNome, preco: novoPreco, categoria: novaCategoria, ordem: novaOrdem, ativo: novoAtivo }
            });
        } catch (error) {
            console.error('Erro ao atualizar adicional de açaí:', error);
            res.status(500).json({ success: false, error: 'Erro ao atualizar adicional' });
        }
    });

    // Toggle adicional
    router.patch('/adicionais/:id/toggle', async (req, res) => {
        try {
            const { id } = req.params;
            const adicional = await db.get('SELECT * FROM acai_adicionais WHERE id = ?', [id]);
            if (!adicional) {
                return res.status(404).json({ success: false, error: 'Adicional não encontrado' });
            }

            const novoAtivo = adicional.ativo ? 0 : 1;
            await db.run('UPDATE acai_adicionais SET ativo = ? WHERE id = ?', [novoAtivo, id]);
            res.json({ success: true, adicional: { ...adicional, ativo: novoAtivo } });
        } catch (error) {
            console.error('Erro ao alternar status do adicional:', error);
            res.status(500).json({ success: false, error: 'Erro ao alternar status' });
        }
    });

    // Remover adicional
    router.delete('/adicionais/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const adicional = await db.get('SELECT * FROM acai_adicionais WHERE id = ?', [id]);
            if (!adicional) {
                return res.status(404).json({ success: false, error: 'Adicional não encontrado' });
            }

            await db.run('DELETE FROM acai_adicionais WHERE id = ?', [id]);
            res.json({ success: true });
        } catch (error) {
            console.error('Erro ao remover adicional de açaí:', error);
            res.status(500).json({ success: false, error: 'Erro ao remover adicional' });
        }
    });

    // ============= CONFIG =============

    // Buscar configurações
    router.get('/config', async (req, res) => {
        try {
            const config = await db.get('SELECT * FROM acai_config WHERE id = 1');
            res.json({ success: true, config: config || { habilitado: 1, categoria_nome: 'Açaí' } });
        } catch (error) {
            console.error('Erro ao buscar configurações de açaí:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar configurações' });
        }
    });

    // Atualizar configurações
    router.put('/config', async (req, res) => {
        try {
            const { habilitado, categoria_nome } = req.body;

            const existe = await db.get('SELECT * FROM acai_config WHERE id = 1');

            if (existe) {
                await db.run(
                    'UPDATE acai_config SET habilitado = ?, categoria_nome = ? WHERE id = 1',
                    [habilitado !== undefined ? (habilitado ? 1 : 0) : existe.habilitado, categoria_nome || existe.categoria_nome]
                );
            } else {
                await db.run(
                    'INSERT INTO acai_config (id, habilitado, categoria_nome) VALUES (1, ?, ?)',
                    [habilitado !== undefined ? (habilitado ? 1 : 0) : 1, categoria_nome || 'Açaí']
                );
            }

            const config = await db.get('SELECT * FROM acai_config WHERE id = 1');
            res.json({ success: true, config });
        } catch (error) {
            console.error('Erro ao atualizar configurações de açaí:', error);
            res.status(500).json({ success: false, error: 'Erro ao atualizar configurações' });
        }
    });

    // ============= PRODUTO CONFIG =============

    // Buscar configuração de um produto
    router.get('/produto-config/:produtoId', async (req, res) => {
        try {
            const { produtoId } = req.params;
            const config = await db.get('SELECT * FROM acai_produto_config WHERE produto_id = ?', [produtoId]);
            res.json({ success: true, config: config || { produto_id: parseInt(produtoId), adicionais_gratis: 0 } });
        } catch (error) {
            console.error('Erro ao buscar configuração do produto:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar configuração' });
        }
    });

    // Listar todas as configurações de produtos
    router.get('/produto-config', async (req, res) => {
        try {
            const configs = await db.all(`
        SELECT apc.*, p.nome as produto_nome, p.preco as produto_preco, p.categoria as produto_categoria
        FROM acai_produto_config apc
        JOIN produtos p ON p.id = apc.produto_id
        ORDER BY p.nome
      `);
            res.json({ success: true, configs });
        } catch (error) {
            console.error('Erro ao listar configurações de produtos:', error);
            res.status(500).json({ success: false, error: 'Erro ao listar configurações' });
        }
    });

    // Criar ou atualizar configuração de produto
    router.post('/produto-config', async (req, res) => {
        try {
            const { produto_id, adicionais_gratis } = req.body;

            if (!produto_id) {
                return res.status(400).json({ success: false, error: 'ID do produto é obrigatório' });
            }

            const produto = await db.get('SELECT * FROM produtos WHERE id = ?', [produto_id]);
            if (!produto) {
                return res.status(404).json({ success: false, error: 'Produto não encontrado' });
            }

            const existente = await db.get('SELECT * FROM acai_produto_config WHERE produto_id = ?', [produto_id]);

            if (existente) {
                await db.run('UPDATE acai_produto_config SET adicionais_gratis = ? WHERE produto_id = ?', [parseInt(adicionais_gratis) || 0, produto_id]);
            } else {
                await db.run('INSERT INTO acai_produto_config (produto_id, adicionais_gratis) VALUES (?, ?)', [produto_id, parseInt(adicionais_gratis) || 0]);
            }

            const config = await db.get('SELECT * FROM acai_produto_config WHERE produto_id = ?', [produto_id]);
            res.json({ success: true, config });
        } catch (error) {
            console.error('Erro ao salvar configuração do produto:', error);
            res.status(500).json({ success: false, error: 'Erro ao salvar configuração' });
        }
    });

    // Remover configuração de produto
    router.delete('/produto-config/:produtoId', async (req, res) => {
        try {
            const { produtoId } = req.params;
            await db.run('DELETE FROM acai_produto_config WHERE produto_id = ?', [produtoId]);
            res.json({ success: true });
        } catch (error) {
            console.error('Erro ao remover configuração do produto:', error);
            res.status(500).json({ success: false, error: 'Erro ao remover configuração' });
        }
    });

    return router;
}
