require('dotenv').config();
const { getDb, DB_PATH } = require('../database');

(async () => {
  try {
    const db = await getDb();
    db.close((err) => {
      if (err) {
        console.error('Erro ao fechar o banco de dados:', err);
      } else {
        console.log(`Banco de dados inicializado em: ${DB_PATH}`);
      }
    });
  } catch (error) {
    console.error('Falha ao inicializar o banco de dados:', error);
    process.exitCode = 1;
  }
})();
