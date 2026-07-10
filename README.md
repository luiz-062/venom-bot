# Ofertas Afiliadas — MVP Mercado Livre

MVP manual/semi-automático para transformar mensagens de ofertas (coladas de grupos, canais ou fontes públicas) em publicações **próprias**, com link afiliado do Mercado Livre, prontas para copiar e colar no seu grupo de WhatsApp e no seu canal de Telegram.

Não lê WhatsApp/Telegram automaticamente, não publica sozinho e não copia a mensagem original — veja `docs/nova-versao-mvp-mercadolivre.md` para o raciocínio completo por trás dessas decisões.

## Como funciona

1. Você cola o texto bruto da oferta em `/`.
2. O sistema extrai dados objetivos (link, produto, preço, cupom, frete, observações) — sem inventar nada que não encontrar.
3. Identifica se o link é do Mercado Livre, limpa parâmetros de rastreio genéricos e resolve redirecionamentos.
4. Tenta gerar um link afiliado a partir da configuração da plataforma (`/config`), sempre marcando o método usado e se a comissão está confirmada ou não.
5. Verifica só se o link final abre — isso **não** confirma preço, estoque, cupom, frete, comissão ou reputação do vendedor.
6. Gera 3 versões de copy curtas e informais, sem reaproveitar o texto original.
7. Mostra tudo em `/offers/:id`, junto com um status final conservador (`pronto_para_publicar` / `revisar_antes_de_publicar` / `rejeitar`) — você decide manualmente o que publicar.

## Rodando localmente

```bash
npm install
cp .env.example .env
npm start
```

Acesse `http://localhost:3000`.

## Configuração de afiliado

Antes de gerar links de verdade, preencha `/config` para o Mercado Livre: affiliate ID/tag, token (se existir) e o método de geração de link. **Não presuma** que troca de parâmetro de URL gera comissão — isso precisa ser confirmado na documentação/painel oficial do Mercado Livre. Enquanto não houver confirmação, deixe o método como `manual` e gere o link você mesmo, colando-o depois na tela da oferta.

## Estrutura do projeto

```
.
├── src/
│   ├── server.js          # rotas Express (formulário, resultado, histórico, config)
│   ├── lib/
│   │   ├── extract.js       # extração de dados a partir do texto colado
│   │   ├── linkUtils.js     # detecção de plataforma, limpeza e resolução de link
│   │   ├── affiliateLink.js # geração/hipótese de link afiliado
│   │   ├── copyGenerator.js # geração das 3 variações de copy
│   │   └── pipeline.js      # orquestra o fluxo completo por oferta
│   ├── store/
│   │   └── jsonStore.js     # persistência simples em arquivo JSON (ofertas + config)
│   └── views/
│       └── render.js        # HTML server-side, sem dependência de template engine
├── data/                    # offers.json e platform-config.json (gerados em runtime, git-ignorados)
├── docs/
│   └── nova-versao-mvp-mercadolivre.md   # documento de produto/arquitetura
├── legacy/
│   └── shopee-whatsapp-bot/ # bot antigo (100% automático via venom-bot) — mantido só como referência
└── test/
    └── pipeline.test.js
```

## Limitações conhecidas do MVP

- Validação mínima = "o link abre". Não garante preço, cupom, disponibilidade, frete, comissão ou vendedor confiável.
- Método de geração de link afiliado por troca de parâmetro é sempre tratado como hipótese não confirmada, nunca como garantia de comissão.
- Sem filtros comerciais, sem publicação automática, sem leitura automática de WhatsApp/Telegram.
- Persistência em arquivo JSON local — suficiente para o volume do MVP; troque por um banco quando o volume justificar.

## Legado

`legacy/shopee-whatsapp-bot/` contém a versão anterior (Shopee, 100% automática, via `venom-bot`). Não é usada por este app; foi mantida apenas como referência histórica do que funcionou (deduplicação, logs, entrega a grupos próprios) e do que trazia risco (envio automático sem revisão, dependência de WhatsApp Web).
