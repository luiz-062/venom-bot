// Ponto de entrada único: servidor web + os três workers de automação, tudo
// no mesmo processo Node (ver docs/nova-versao-mvp-mercadolivre.md — isso é
// o que evita condição de corrida na escrita dos arquivos JSON sem precisar
// de banco de dados). WhatsApp continua fora daqui de propósito — não existe
// worker de WhatsApp neste projeto.
require('./server');

function safeStart(label, starter) {
  try {
    starter();
    console.log(`[index] ${label}: iniciado.`);
  } catch (error) {
    console.warn(
      `[index] ${label}: não iniciado (${error.message}). O app continua rodando sem essa automação até você completar a configuração (ver docs/nova-versao-mvp-mercadolivre.md).`
    );
  }
}

safeStart('leitor automático de canais-fonte do Telegram', () => require('./telegram/sourceReader').start());
safeStart('gerador automático de link do Mercado Livre', () => require('./automation/linkGenerationWorker').start());
safeStart('publicador automático no Telegram', () => require('./telegram/publisherWorker').start());
