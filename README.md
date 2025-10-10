# Shopee Affiliate WhatsApp Bot

Automated Node.js bot that fetches discounted products from Shopee via the official Partner & Affiliate APIs and shares the best deals with configured WhatsApp groups using the `venom-bot` library. All offers that have already been sent are tracked locally using SQLite to avoid duplicates, and the bot can be paused or resumed directly from the terminal.

## Features

- ✅ 100% official Shopee API usage (`/api/v2/product/search_item` and `/api/v2/affiliate/generate_links`).
- 🔐 Secure HMAC-SHA256 request signing aligned with Shopee Open Platform requirements.
- 🤖 Persistent Venom Bot session with multi-device support, QR code login, and automatic reconnection.
- 🗃️ Local SQLite history (`sent_offers`) ensures the same promotion is never sent twice.
- ⏱️ Configurable fetch interval, keyword list, minimum discount filter, and optional image sending.
- 🎯 Automatic affiliate link generation with graceful UTM fallback if the API cannot produce a link.
- 🧭 Console controls: `p` pauses/resumes the campaign, `q` performs a graceful shutdown.
- 🪵 Detailed logging of API calls, filtering decisions, WhatsApp sends, errors, and pause/resume state changes.

## Requirements

- Windows 10/11 machine with [Node.js 18 or newer](https://nodejs.org/) installed.
- Valid Shopee Partner & Affiliate credentials with API access enabled.
- WhatsApp account with permission to post in the desired groups.

## Getting started

1. **Clone this repository**
   ```bash
   git clone https://github.com/<seu-usuario>/shopee-affiliate-whatsapp-bot.git
   cd shopee-affiliate-whatsapp-bot
   ```
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in all required credentials and options:
   | Variable | Description |
   | --- | --- |
   | `SHOPEE_PARTNER_ID` | Partner ID from Shopee Open Platform. |
   | `SHOPEE_PARTNER_KEY` | Partner secret key used to sign requests. |
   | `SHOPEE_SHOP_ID` | Shop ID that owns the catalog. |
   | `SHOPEE_AFFILIATE_ID` | Affiliate program identifier. |
   | `SHOPEE_ACCESS_TOKEN` | Optional access token (required when Shopee mandates OAuth). Leave blank if not applicable. |
   | `SHOPEE_REGION` | Region code (default `br`). Automatically sets API host and product domain. |
   | `AFF_SOURCE`, `AFF_SUB`, `UTM_CAMPAIGN` | Attribution parameters for affiliate tracking. |
   | `WHATSAPP_GROUPS` | JSON array with the exact group names. |
   | `SEND_INTERVAL_SECONDS` | Delay between consecutive messages. |
   | `SEARCH_KEYWORDS` | Comma-separated list of keywords to query. |
   | `MIN_DISCOUNT_PERCENT` | Minimum discount percentage required to send an offer. |
   | `MAX_RESULTS` | Maximum results per keyword request. |
   | `SEND_IMAGES` | `true` to send product cover images (when available). |

4. **Initialize the SQLite database**
   ```bash
   npm run init-db
   ```
   This creates `data/bot.sqlite` and prepares the `sent_offers` table.

5. **Start the bot**
   ```bash
   npm start
   ```
   - A QR code will appear in the console on first launch. Scan it with WhatsApp to authenticate.
   - The bot keeps running 24/7, automatically fetching new items and posting them to your groups.

## Como executar (passo a passo em Português)

1. **Instale o Node.js 18 ou superior** no Windows e abra o *Terminal* ou *PowerShell*.
2. **Baixe o projeto**
   ```powershell
   git clone https://github.com/<seu-usuario>/shopee-affiliate-whatsapp-bot.git
   cd shopee-affiliate-whatsapp-bot
   ```
3. **Instale as dependências**
   ```powershell
   npm install
   ```
4. **Copie o arquivo de exemplo de variáveis de ambiente**
   ```powershell
   copy .env.example .env
   ```
   Preencha o arquivo `.env` com os dados da sua conta Shopee Partner/Affiliate e com os nomes exatos dos grupos de WhatsApp.
5. **Crie o banco de dados local**
   ```powershell
   npm run init-db
   ```
6. **Execute o bot**
   ```powershell
   npm start
   ```
   - No primeiro uso, um QR Code será exibido no terminal. Escaneie com o WhatsApp (modo multi-dispositivo).
   - Após autenticado, o bot ficará rodando continuamente, enviando promoções conforme os filtros definidos.
7. **Controle pelo terminal**
   - Digite `p` para pausar ou retomar o envio de mensagens.
   - Digite `q` para encerrar o bot de forma segura.

## Runtime controls

- Press **`p`** in the terminal to toggle between paused and active modes.
- Press **`q`** to gracefully shut down the bot, closing the WhatsApp session and database connection.

## Message format

Every promotion sent to WhatsApp follows this template:
```
🛒 {product_name}
💸 De R${old_price} → R${price}
🔗 {affiliate_link}
#Shopee #Ofertas #PromoDeAmiga
```

Images are attached when `SEND_IMAGES=true` and the API response provides an image ID.

## Project structure

```
.
├── index.js              # Main orchestrator loop
├── shopeeApi.js          # Shopee Partner & Affiliate API client with HMAC signing
├── whatsappBot.js        # Venom Bot session management and group messaging helpers
├── database.js           # SQLite helpers for sent offer tracking
├── scripts
│   └── initDb.js         # One-shot script to bootstrap the SQLite database
├── .env.example          # Sample environment configuration
├── package.json
└── README.md
```

## Error handling & reliability

- Shopee API calls are automatically retried on HTTP 429/503 responses with exponential backoff.
- If the affiliate API cannot return a link, the bot falls back to the original URL with UTM parameters.
- WhatsApp disconnections trigger automatic reconnection attempts and are logged.
- All decisions (filtering, duplicates, pauses, retries) are logged to the console for transparency.

## Optional enhancements

- **Build a standalone executable:** Install [`pkg`](https://github.com/vercel/pkg) globally and run `pkg .` to produce a Windows `.exe` bundle.
- **PM2 process manager:** Add a `pm2.config.cjs` file and use `pm2 start pm2.config.cjs` for automatic restarts if the bot stops unexpectedly.

## Disclaimer

This project is provided as-is. Ensure that your usage complies with Shopee's Partner & Affiliate Program policies, WhatsApp's terms of service, and any local regulations regarding automated messaging.
