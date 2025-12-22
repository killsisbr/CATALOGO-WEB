import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Credenciais do admin (configurar via .env)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'campestre123';

// Endpoint de login admin
router.post('/admin/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (username === ADMIN_USER && password === ADMIN_PASS) {
            const jwtSecret = process.env.JWT_SECRET || 'campestre_secret_2024';
            const token = jwt.sign(
                { role: 'admin', user: username },
                jwtSecret,
                { expiresIn: '7d' }
            );

            console.log(`✅ Admin login: ${username}`);
            res.json({ success: true, token });
        } else {
            console.log(`❌ Admin login falhou: ${username}`);
            res.status(401).json({ success: false, error: 'Usuário ou senha incorretos' });
        }
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ success: false, error: 'Erro interno' });
    }
});

// Endpoint para verificar token
router.get('/admin/verify', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.json({ valid: false });
        }

        const token = authHeader.split(' ')[1];
        const jwtSecret = process.env.JWT_SECRET || 'campestre_secret_2024';

        try {
            const payload = jwt.verify(token, jwtSecret);
            res.json({ valid: true, user: payload.user, role: payload.role });
        } catch (err) {
            res.json({ valid: false });
        }
    } catch (error) {
        res.json({ valid: false });
    }
});

// Endpoint que retorna a sessão (whatsappId) a partir do cookie brutus_token
router.get('/session', (req, res) => {
    try {
        const raw = req.headers.cookie || '';
        const parts = raw.split(';').map(p => p.trim());
        const tokenPart = parts.find(p => p.startsWith('brutus_token='));
        if (!tokenPart) return res.json({ success: false });
        const token = tokenPart.replace('brutus_token=', '');

        const jwtSecret = process.env.JWT_SECRET || 'change_this_secret_in_env';
        try {
            const payload = jwt.verify(token, jwtSecret);
            return res.json({ success: true, session: payload });
        } catch (err) {
            return res.json({ success: false });
        }
    } catch (err) {
        return res.json({ success: false });
    }
});

// Endpoint para receber token JWT e setar cookie de sessão
router.get('/welcome', (req, res) => {
    try {
        const token = req.query.token;
        if (!token) {
            return res.redirect('/pedido');
        }

        const jwtSecret = process.env.JWT_SECRET || 'change_this_secret_in_env';
        let payload;
        try {
            payload = jwt.verify(token, jwtSecret);
        } catch (err) {
            console.warn('Token invalid or expired in /auth/welcome:', err && err.message);
            return res.redirect('/pedido');
        }

        // Calcular maxAge do cookie com base em exp do token
        let maxAge = 90 * 24 * 60 * 60 * 1000;
        try {
            const decoded = jwt.decode(token);
            if (decoded && decoded.exp) {
                const expMs = decoded.exp * 1000;
                const remaining = expMs - Date.now();
                if (remaining > 0) maxAge = remaining;
            }
        } catch (e) { /* ignore */ }

        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: maxAge,
            sameSite: 'Lax',
            path: '/'
        };

        res.cookie('brutus_token', token, cookieOptions);
        return res.redirect('/pedido');
    } catch (err) {
        console.error('Erro no /auth/welcome:', err && err.message);
        return res.redirect('/pedido');
    }
});

export default router;
