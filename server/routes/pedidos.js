import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Função auxiliar para recalcular total do pedido
async function recalcularTotalPedido(db, pedidoId) {
    const itens = await db.all('SELECT * FROM pedido_itens WHERE pedido_id = ?', [pedidoId]);
    let total = 0;
    for (const item of itens) {
        let precoItem = parseFloat(item.preco_unitario || 0);
        if (item.adicionais) {
            try {
                const extras = typeof item.adicionais === 'string' ? JSON.parse(item.adicionais) : item.adicionais;
                const adicionais = extras.adicionais || extras || [];
                if (Array.isArray(adicionais)) {
                    precoItem += adicionais.reduce((acc, a) => acc + parseFloat(a.preco || a.price || 0), 0);
                }
            } catch (e) { /* ignorar */ }
        }
        total += precoItem * (item.quantidade || 1);
    }
    const pedido = await db.get('SELECT valor_entrega FROM pedidos WHERE id = ?', [pedidoId]);
    total += parseFloat(pedido?.valor_entrega || 0);

    await db.run('UPDATE pedidos SET total = ? WHERE id = ?', [total, pedidoId]);
    return total;
}

// Helper para carregar pedido completo
async function carregarPedidoCompleto(db, pedidoId) {
    const pedido = await db.get('SELECT * FROM pedidos WHERE id = ?', [pedidoId]);
    if (!pedido) return null;

    const itens = await db.all(`
    SELECT pi.*, pr.nome as produto_nome, pr.preco as produto_preco
    FROM pedido_itens pi
    LEFT JOIN produtos pr ON pi.produto_id = pr.id
    WHERE pi.pedido_id = ?
  `, [pedidoId]);

    pedido.itens = itens.map(i => ({
        ...i,
        adicionais: i.adicionais ? (typeof i.adicionais === 'string' ? JSON.parse(i.adicionais) : i.adicionais) : []
    }));

    return pedido;
}

export default function (db, { getWhatsappService, getRobotEnabled, getDeliveryService }) {

    // Listar pedidos
    router.get('/', async (req, res) => {
        try {
            const pedidos = await db.all(`
        SELECT p.*
        FROM pedidos p
        ORDER BY p.data DESC
      `);

            for (const pedido of pedidos) {
                const itens = await db.all(`
          SELECT pi.*, pr.nome as produto_nome
          FROM pedido_itens pi
          LEFT JOIN produtos pr ON pi.produto_id = pr.id
          WHERE pi.pedido_id = ?
        `, [pedido.id]);
                pedido.itens = itens.map(i => ({
                    ...i,
                    adicionais: i.adicionais ? (typeof i.adicionais === 'string' ? JSON.parse(i.adicionais) : i.adicionais) : []
                }));
                pedido.status = pedido.status || 'pending';
            }

            res.json(pedidos);
        } catch (error) {
            console.error('Erro ao buscar pedidos:', error);
            res.status(500).json({ error: 'Erro ao buscar pedidos' });
        }
    });

    // Buscar pedido por ID
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const pedido = await carregarPedidoCompleto(db, id);

            if (!pedido) {
                return res.status(404).json({ error: 'Pedido não encontrado' });
            }

            pedido.status = pedido.status || 'pending';
            res.json(pedido);
        } catch (error) {
            console.error('Erro ao buscar pedido:', error);
            res.status(500).json({ error: 'Erro ao buscar pedido' });
        }
    });

    // Criar pedido
    router.post('/', async (req, res) => {
        try {
            const { cliente, itens, total, entrega } = req.body;
            const whatsappService = getWhatsappService();
            const robotEnabled = getRobotEnabled();

            // Verificar blacklist
            let isBlacklisted = 0;
            try {
                const telefoneNormalizado = String(cliente.telefone).replace(/\D/g, '');
                const blacklistItem = await db.get(
                    `SELECT * FROM blacklist WHERE REPLACE(REPLACE(REPLACE(telefone, '-', ''), ' ', ''), '(', '') LIKE ?`,
                    [`%${telefoneNormalizado}%`]
                );
                if (blacklistItem) {
                    isBlacklisted = 1;
                    console.log('Pedido de numero na blacklist:', cliente.telefone);
                }
            } catch (e) { /* ignorar */ }

            // Inserir pedido
            const nowIso = new Date().toISOString();
            const isPickup = cliente.isPickup ? 1 : 0;
            const whatsappIdCompleto = cliente.whatsappId || null;

            const result = await db.run(
                'INSERT INTO pedidos (cliente_nome, cliente_telefone, cliente_endereco, forma_pagamento, total, distancia, valor_entrega, coordenadas_cliente, observacao_entrega, data, is_pickup, is_blacklisted, whatsapp_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [cliente.nome, cliente.telefone, cliente.endereco, cliente.pagamento, total, entrega?.distancia || null, (entrega?.price || entrega?.valor) || null, entrega?.coordenadas ? JSON.stringify(entrega.coordenadas) : null, (entrega && (entrega.addressNote || entrega.observacao)) || null, nowIso, isPickup, isBlacklisted, whatsappIdCompleto]
            );

            const pedidoId = result.lastID;

            // Inserir itens do pedido
            for (const item of itens) {
                const adicionais = Array.isArray(item.adicionais) ? item.adicionais : [];
                const buffet = Array.isArray(item.buffet) ? item.buffet : [];
                const acaiData = item.acaiData || null;
                const observacao = item.observacao || '';

                const todosExtras = { adicionais, buffet, acaiData };

                await db.run(
                    'INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario, adicionais, observacao) VALUES (?, ?, ?, ?, ?, ?)',
                    [pedidoId, item.produto.id, item.quantidade, item.produto.preco, JSON.stringify(todosExtras), observacao]
                );
            }

            // Enviar notificações via WhatsApp
            if (cliente.whatsappId && robotEnabled && whatsappService) {
                setImmediate(async () => {
                    try {
                        await whatsappService.sendOrderSummaryToId(cliente.whatsappId, { pedidoId, cliente, itens, total, entrega });
                    } catch (error) {
                        console.error('Erro ao enviar notificacao via WhatsApp:', error);
                    }
                });
            }

            if (robotEnabled && whatsappService) {
                setImmediate(async () => {
                    try {
                        await whatsappService.sendOrderToDeliveryGroup({
                            pedidoId,
                            cliente: { ...cliente, pagamento: cliente.pagamento, troco: cliente.troco },
                            itens, total, entrega
                        });
                    } catch (error) {
                        console.error('Erro ao enviar pedido para o grupo de entregas:', error);
                    }
                });
            }

            // Gerar JWT para cookie
            try {
                const jwtSecret = process.env.JWT_SECRET || 'change_this_secret_in_env';
                const payload = {
                    whatsappId: cliente.whatsappId || null,
                    telefone: cliente.telefone || null,
                    nome: cliente.nome || null,
                    endereco: cliente.endereco || (entrega && (entrega.address || entrega.endereco)) || null,
                    deliveryFee: (entrega && (entrega.price ?? entrega.valor)) ?? null,
                    distancia: entrega?.distancia ?? null,
                    coordenadas: entrega?.coordenadas ?? entrega?.coordinates ?? null
                };
                const token = jwt.sign(payload, jwtSecret, { expiresIn: '90d' });

                const cookieOptions = {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 90 * 24 * 60 * 60 * 1000,
                    sameSite: 'Lax',
                    path: '/'
                };

                res.cookie('brutus_token', token, cookieOptions);
                res.json({ success: true, pedidoId, message: 'Pedido criado com sucesso!' });
            } catch (err) {
                res.json({ success: true, pedidoId, message: 'Pedido criado com sucesso!' });
            }
        } catch (error) {
            console.error('Erro ao criar pedido:', error);
            res.status(500).json({ error: 'Erro ao criar pedido' });
        }
    });

    // Atualizar status do pedido
    router.put('/:id/status', async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;
            await db.run('UPDATE pedidos SET status = ? WHERE id = ?', [status, id]);
            res.json({ success: true });
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            res.status(500).json({ success: false, error: 'Erro ao atualizar status' });
        }
    });

    // Marcar pedido como blacklisted
    router.put('/:id/blacklist', async (req, res) => {
        try {
            const { id } = req.params;
            const { is_blacklisted } = req.body;
            await db.run('UPDATE pedidos SET is_blacklisted = ? WHERE id = ?', [is_blacklisted ? 1 : 0, id]);
            res.json({ success: true });
        } catch (error) {
            console.error('Erro ao marcar pedido como blacklisted:', error);
            res.status(500).json({ success: false, error: 'Erro ao marcar pedido' });
        }
    });

    // Atualizar endereço do pedido
    router.put('/:id/endereco', async (req, res) => {
        try {
            const { id } = req.params;
            const { endereco, recalc } = req.body;
            const deliveryService = getDeliveryService();
            const whatsappService = getWhatsappService();
            const robotEnabled = getRobotEnabled();

            const pedido = await db.get('SELECT * FROM pedidos WHERE id = ?', [id]);
            if (!pedido) {
                return res.status(404).json({ error: 'Pedido não encontrado' });
            }

            await db.run('UPDATE pedidos SET cliente_endereco = ? WHERE id = ?', [endereco, id]);

            if (recalc && deliveryService) {
                try {
                    const taxa = await deliveryService.calcularTaxaPorEndereco(endereco);
                    if (taxa && taxa.success) {
                        await db.run('UPDATE pedidos SET distancia = ?, valor_entrega = ?, coordenadas_cliente = ? WHERE id = ?', [
                            taxa.distance, taxa.price, taxa.coordinates ? JSON.stringify(taxa.coordinates) : null, id
                        ]);
                    }
                } catch (err) {
                    console.warn('Falha ao recalcular taxa:', err && err.message);
                }
            }

            res.json({ success: true, message: 'Endereço atualizado com sucesso!', pedidoId: id });
        } catch (error) {
            console.error('Erro ao atualizar endereço do pedido:', error);
            res.status(500).json({ error: 'Erro ao atualizar endereço do pedido' });
        }
    });

    // Excluir pedido
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const pedido = await db.get('SELECT * FROM pedidos WHERE id = ?', [id]);
            if (!pedido) {
                return res.status(404).json({ error: 'Pedido não encontrado' });
            }

            await db.run('DELETE FROM pedido_itens WHERE pedido_id = ?', [id]);
            await db.run('DELETE FROM pedidos WHERE id = ?', [id]);
            res.json({ success: true, message: 'Pedido excluído com sucesso!' });
        } catch (error) {
            console.error('Erro ao excluir pedido:', error);
            res.status(500).json({ error: 'Erro ao excluir pedido' });
        }
    });

    // === ITENS DO PEDIDO ===

    // Adicionar item
    router.post('/:pedidoId/itens', async (req, res) => {
        try {
            const { pedidoId } = req.params;
            const { produto_id, quantidade, preco_unitario, observacao } = req.body;

            const result = await db.run(
                'INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario, observacao) VALUES (?, ?, ?, ?, ?)',
                [pedidoId, produto_id, quantidade || 1, preco_unitario, observacao || '']
            );

            const novoTotal = await recalcularTotalPedido(db, pedidoId);
            res.json({ success: true, itemId: result.lastID, novoTotal });
        } catch (error) {
            console.error('Erro ao adicionar item:', error);
            res.status(500).json({ success: false, error: 'Erro ao adicionar item' });
        }
    });

    // Atualizar quantidade do item
    router.put('/:pedidoId/itens/:itemId', async (req, res) => {
        try {
            const { pedidoId, itemId } = req.params;
            const { quantidade } = req.body;

            if (quantidade < 1) {
                return res.status(400).json({ success: false, error: 'Quantidade mínima é 1' });
            }

            await db.run('UPDATE pedido_itens SET quantidade = ? WHERE id = ? AND pedido_id = ?', [quantidade, itemId, pedidoId]);
            const novoTotal = await recalcularTotalPedido(db, pedidoId);
            res.json({ success: true, novoTotal });
        } catch (error) {
            console.error('Erro ao atualizar item:', error);
            res.status(500).json({ success: false, error: 'Erro ao atualizar item' });
        }
    });

    // Remover item
    router.delete('/:pedidoId/itens/:itemId', async (req, res) => {
        try {
            const { pedidoId, itemId } = req.params;

            const countItens = await db.get('SELECT COUNT(*) as count FROM pedido_itens WHERE pedido_id = ?', [pedidoId]);
            if (countItens.count <= 1) {
                return res.status(400).json({ success: false, error: 'Não é possível remover o último item do pedido' });
            }

            await db.run('DELETE FROM pedido_itens WHERE id = ? AND pedido_id = ?', [itemId, pedidoId]);
            const novoTotal = await recalcularTotalPedido(db, pedidoId);
            res.json({ success: true, novoTotal });
        } catch (error) {
            console.error('Erro ao remover item:', error);
            res.status(500).json({ success: false, error: 'Erro ao remover item' });
        }
    });

    return router;
}
