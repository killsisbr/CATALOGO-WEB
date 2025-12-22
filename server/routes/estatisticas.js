import express from 'express';

const router = express.Router();

export default function (db) {

    // Produtos mais vendidos
    router.get('/produtos-mais-vendidos', async (req, res) => {
        try {
            const produtosMaisVendidos = await db.all(`
        SELECT 
          pr.nome as produto_nome,
          pr.categoria as produto_categoria,
          SUM(pi.quantidade) as total_vendido,
          SUM(pi.quantidade * pi.preco_unitario) as valor_total
        FROM pedido_itens pi
        JOIN produtos pr ON pi.produto_id = pr.id
        JOIN pedidos p ON pi.pedido_id = p.id
        WHERE p.status != 'archived'
        GROUP BY pi.produto_id, pr.nome, pr.categoria
        ORDER BY total_vendido DESC
        LIMIT 10
      `);

            res.json(produtosMaisVendidos);
        } catch (error) {
            console.error('Erro ao buscar produtos mais vendidos:', error);
            res.status(500).json({ error: 'Erro ao buscar produtos mais vendidos' });
        }
    });

    // Melhores clientes
    router.get('/melhores-clientes', async (req, res) => {
        try {
            const melhoresClientes = await db.all(`
        SELECT 
          c.nome as cliente_nome,
          c.telefone as cliente_telefone,
          COUNT(p.id) as total_pedidos,
          SUM(p.total) as valor_total_gasto
        FROM clientes c
        JOIN pedidos p ON c.nome = p.cliente_nome
        WHERE p.status != 'archived'
        GROUP BY c.id, c.nome, c.telefone
        ORDER BY valor_total_gasto DESC
        LIMIT 10
      `);

            res.json(melhoresClientes);
        } catch (error) {
            console.error('Erro ao buscar melhores clientes:', error);
            res.status(500).json({ error: 'Erro ao buscar melhores clientes' });
        }
    });

    // Valores de entrega
    router.get('/valores-entrega', async (req, res) => {
        try {
            const valoresEntrega = await db.all(`
        SELECT 
          SUM(valor_entrega) as total_valor_entregas,
          AVG(valor_entrega) as media_valor_entregas,
          COUNT(*) as total_entregas
        FROM pedidos
        WHERE valor_entrega IS NOT NULL AND status != 'archived'
      `);

            res.json(valoresEntrega[0] || { total_valor_entregas: 0, media_valor_entregas: 0, total_entregas: 0 });
        } catch (error) {
            console.error('Erro ao buscar valores de entrega:', error);
            res.status(500).json({ error: 'Erro ao buscar valores de entrega' });
        }
    });

    // Estatísticas gerais
    router.get('/gerais', async (req, res) => {
        try {
            const estatisticasGerais = await db.all(`
        SELECT 
          COUNT(*) as total_pedidos,
          SUM(total) as valor_total_pedidos,
          AVG(total) as ticket_medio,
          COUNT(DISTINCT cliente_nome) as total_clientes
        FROM pedidos
        WHERE status != 'archived'
      `);

            res.json(estatisticasGerais[0] || { total_pedidos: 0, valor_total_pedidos: 0, ticket_medio: 0, total_clientes: 0 });
        } catch (error) {
            console.error('Erro ao buscar estatísticas gerais:', error);
            res.status(500).json({ error: 'Erro ao buscar estatísticas gerais' });
        }
    });

    return router;
}
