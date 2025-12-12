nodeimport path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env da raiz do projeto (um nível acima de /server)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Importar o servidor (server.js) após carregar as variáveis de ambiente
import('./server.js').catch(err => {
  console.error('Erro ao iniciar server.js:', err);
  process.exit(1);
});
