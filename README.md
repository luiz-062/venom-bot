# Ofertas Afiliadas — automação Telegram + Mercado Livre

Transforma mensagens de ofertas em publicações **próprias**, com link afiliado do Mercado Livre. **Telegram é totalmente automático** (leitura dos canais-fonte, geração do link via navegador, publicação no seu canal); **WhatsApp continua 100% manual** por decisão deliberada — veja `docs/nova-versao-mvp-mercadolivre.md` seção 13 para o raciocínio completo (inclusive por que WhatsApp foi deixado de fora).

## Como funciona (Telegram, automático)

1. `src/telegram/sourceReader.js` ouve os canais-fonte configurados (que você segue, mas não precisa administrar) e chama `processOffer()` pra cada mensagem nova.
2. O sistema extrai dados objetivos (link, produto, preço, cupom, frete, observações) — sem inventar nada que não encontrar — e limpa o link, removendo inclusive rastreio de outros afiliados.
3. `src/automation/linkGenerationWorker.js` gera o link de afiliado de verdade num navegador automatizado, logado na sua conta, imitando o fluxo real do Gerador de Links oficial (não é uma fórmula inventada).
4. Gera 3 versões de copy curtas e informais, sem reaproveitar o texto original.
5. `src/telegram/publisherWorker.js` publica automaticamente no seu canal quando o link abre e existe um link afiliado — **isso não é o mesmo que confirmar comissão**, que continua exigindo checagem manual no painel do Mercado Livre.

## Como funciona (WhatsApp e uso manual, sempre disponível)

A interface web (`/`) continua funcionando exatamente como no MVP original: cole uma mensagem, veja o resultado em `/offers/:id`, copie a copy recomendada e cole manualmente no seu grupo de WhatsApp. Nenhuma automação toca WhatsApp neste projeto.

## Rodando localmente

```bash
npm install
cp .env.example .env
npm start
```

Acesse `http://localhost:3000`. Sem as credenciais do `.env` preenchidas, o app sobe normalmente e os workers de automação ficam ociosos/avisam no log — nada quebra por falta de configuração.

## Configuração completa da automação (Telegram + Mercado Livre)

Passos únicos, feitos por você (impossível automatizar — exigem seu celular/conta real):

1. Crie um app em [my.telegram.org](https://my.telegram.org) → `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` no `.env`.
2. `npm run telegram-login` — login interativo na sua conta pessoal, gera `TELEGRAM_SESSION_STRING` (cole no `.env`; nunca commitar).
3. `npm run list-chats` — lista seus canais/grupos com o ID de cada um.
4. Crie um bot via `@BotFather` → `TELEGRAM_BOT_TOKEN`; adicione o bot como admin do seu canal.
5. Em `/config/telegram`, preencha os canais-fonte, o canal de publicação e (opcional) seu chat pessoal para alertas.
6. `npm run ml-login` — abre um navegador de verdade pra você logar normalmente na sua conta de afiliado do Mercado Livre (numa máquina com tela); salva a sessão para a automação de link reaproveitar.
7. Hospede isso numa máquina que fica ligada continuamente — não roda de forma persistente num sandbox efêmero.

## Configuração de afiliado (Mercado Livre)

Em `/config`, o método `automatico_navegador` usa a sessão salva no passo 6 acima. **Não presuma** que troca de parâmetro de URL (`troca_parametro`) gera comissão — pesquisa (ver docs, seção 5) indica que provavelmente não gera, e ainda traz risco de suspensão de conta. Use `manual` como alternativa segura caso a automação de navegador falhe.

## Estrutura do projeto

```
.
├── src/
│   ├── index.js              # ponto de entrada: servidor + os 3 workers, um único processo
│   ├── server.js              # rotas Express (formulário, resultado, histórico, config)
│   ├── lib/
│   │   ├── extract.js          # extração de dados a partir do texto colado
│   │   ├── linkUtils.js        # detecção de plataforma, limpeza e resolução de link
│   │   ├── affiliateLink.js    # geração/hipótese de link afiliado
│   │   ├── finalStatus.js      # cálculo compartilhado do status final
│   │   ├── copyGenerator.js    # geração das 3 variações de copy
│   │   └── pipeline.js         # orquestra o fluxo completo por oferta
│   ├── automation/
│   │   ├── affiliateLinkAutomation.js  # Playwright contra o Gerador de Links real
│   │   └── linkGenerationWorker.js     # fila com atraso entre gerações
│   ├── telegram/
│   │   ├── sourceReader.js     # GramJS — ouve canais-fonte, chama processOffer()
│   │   ├── publisher.js        # grammY — envio com fila/limite de taxa
│   │   └── publisherWorker.js  # fila que publica ofertas prontas
│   ├── store/
│   │   └── jsonStore.js        # persistência em JSON (ofertas + config por plataforma + app-config)
│   └── views/
│       └── render.js           # HTML server-side, sem dependência de template engine
├── scripts/                    # setup único: telegramLogin.js, mercadoLivreLogin.js, listMyChats.js
├── data/                        # offers.json, platform-config.json, app-config.json, sessão salva do ML — tudo git-ignorado
├── docs/
│   └── nova-versao-mvp-mercadolivre.md   # documento de produto/arquitetura (ver seção 13 para a automação)
├── legacy/
│   └── shopee-whatsapp-bot/    # bot antigo (100% automático via venom-bot) — mantido só como referência
└── test/
```

## Limitações conhecidas

- Publicação automática no Telegram **não** equivale a comissão confirmada — o gatilho é só "link abre" + "existe link afiliado". Confirme comissão real no painel oficial do Mercado Livre.
- Os seletores da automação de navegador (`src/automation/affiliateLinkAutomation.js`) são placeholders — precisam ser confirmados com `npx playwright codegen` numa sessão real (ver docs, seção 13).
- Automação de Telegram para *ler* canais que você não administra usa um userbot (GramJS/MTProto), o que é contra os termos de uso do Telegram para automação de conta pessoal e carrega risco real de restrição/banimento — decisão explícita e informada do usuário, documentada na seção 13 dos docs.
- WhatsApp continua 100% manual, sem exceção.

## Legado

`legacy/shopee-whatsapp-bot/` contém a versão anterior (Shopee, 100% automática, via `venom-bot`). Não é usada por este app; foi mantida apenas como referência histórica do que funcionou (deduplicação, logs, entrega a grupos próprios) e do que trazia risco (envio automático sem revisão, dependência de WhatsApp Web).
