function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

const STYLE = `
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 840px; margin: 0 auto; padding: 1.5rem; line-height: 1.5; }
  nav { display: flex; gap: 1rem; margin-bottom: 1.5rem; font-size: 0.9rem; }
  nav a { text-decoration: none; }
  textarea { width: 100%; min-height: 160px; font-family: inherit; font-size: 1rem; padding: 0.6rem; box-sizing: border-box; }
  input[type=text] { width: 100%; padding: 0.4rem; box-sizing: border-box; }
  label { display: block; margin-top: 0.8rem; font-weight: 600; font-size: 0.9rem; }
  button { margin-top: 1rem; padding: 0.6rem 1.2rem; font-size: 1rem; cursor: pointer; }
  .card { border: 1px solid #8884; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
  .badge-pronto { background: #1a7f37; color: #fff; }
  .badge-revisar { background: #9a6700; color: #fff; }
  .badge-rejeitar { background: #cf222e; color: #fff; }
  .copy-block { white-space: pre-wrap; background: #8881; border-radius: 6px; padding: 0.8rem; font-size: 0.95rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  td, th { border-bottom: 1px solid #8884; padding: 0.4rem; text-align: left; vertical-align: top; }
  .risk { color: #b45309; }
  .muted { opacity: 0.7; font-size: 0.85rem; }
  code { font-size: 0.85rem; }
`;

function layout(title, body) {
  return `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${STYLE}</style>
</head>
<body>
  <nav>
    <a href="/">Nova oferta</a>
    <a href="/offers">Histórico</a>
    <a href="/config">Configuração</a>
    <a href="/config/telegram">Automação (Telegram)</a>
  </nav>
  ${body}
</body>
</html>`;
}

function statusBadge(status) {
  const map = {
    pronto_para_publicar: ['badge-pronto', 'pronto para publicar'],
    revisar_antes_de_publicar: ['badge-revisar', 'revisar antes de publicar'],
    rejeitar: ['badge-rejeitar', 'rejeitar'],
  };
  const [cls, label] = map[status] || ['badge-revisar', status || 'desconhecido'];
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function indexPage({ recentOffers }) {
  const rows = recentOffers
    .slice(0, 5)
    .map(
      (offer) => `<tr>
        <td>${escapeHtml(new Date(offer.created_at).toLocaleString('pt-BR'))}</td>
        <td>${escapeHtml(offer.product_name || '(sem nome extraído)')}</td>
        <td>${statusBadge(offer.final_status)}</td>
        <td><a href="/offers/${offer.id}">ver</a></td>
      </tr>`
    )
    .join('');

  return layout(
    'Nova oferta',
    `
    <h1>Colar mensagem de oferta</h1>
    <p class="muted">Cole abaixo o texto bruto copiado de um grupo/canal. Só links do Mercado Livre são processados no MVP.</p>
    <form method="post" action="/offers">
      <textarea name="raw_text" placeholder="Cole aqui a mensagem da oferta..." required></textarea>
      <button type="submit">Processar oferta</button>
    </form>

    ${
      recentOffers.length > 0
        ? `<h2>Últimas ofertas processadas</h2>
    <table>
      <thead><tr><th>Data</th><th>Produto</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
        : ''
    }
  `
  );
}

function fieldRow(label, value) {
  return `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;
}

function offerPage(offer) {
  const link = (url) => (url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>` : '<span class="muted">—</span>');

  return layout(
    `Oferta ${offer.id.slice(0, 8)}`,
    `
    <h1>Oferta processada ${statusBadge(offer.final_status)}</h1>
    <table class="card">
      ${fieldRow('Plataforma', offer.platform || '<span class="muted">não identificada</span>')}
      ${fieldRow('Produto identificado', offer.product_name || '<span class="muted">não identificado</span>')}
      ${fieldRow('Link original', link(offer.original_link))}
      ${fieldRow('Link limpo', link(offer.clean_link))}
      ${fieldRow(
        'Link afiliado',
        offer.affiliate_link
          ? link(offer.affiliate_link)
          : `<span class="muted">${offer.affiliate_method === 'pendente_automatico' ? 'pendente de geração automática' : 'pendente de geração manual'}</span>`
      )}
      ${fieldRow(
        'Método de geração do link',
        `<code>${escapeHtml(offer.affiliate_method)}</code>` +
          (offer.affiliate_method === 'troca_parametro_hipotese'
            ? '<br><span class="risk">Pesquisa externa (10/07/2026) indica que o Mercado Livre não credita comissão para links que não passaram pelo gerador oficial — trate este link como muito provavelmente sem comissão. Gere o link de verdade na central de afiliados e cole em "Ajustar link afiliado" abaixo.</span>'
            : '') +
          (offer.affiliate_method === 'pendente_automatico'
            ? '<br><span class="muted">Aguardando o worker de automação gerar o link de verdade na central de afiliados (roda em segundo plano, com atraso entre gerações). Se demorar demais, verifique se a sessão salva do Mercado Livre ainda está válida em /config/telegram.</span>'
            : '')
      )}
      ${fieldRow('Status de validação do afiliado', `<code>${escapeHtml(offer.affiliate_validation_status)}</code>`)}
      ${fieldRow('Link abre?', `<code>${escapeHtml(offer.link_open_check)}</code>`)}
      ${fieldRow('Preço informado', offer.price_informed || '<span class="muted">—</span>')}
      ${fieldRow('Preço original informado', offer.price_original_informed || '<span class="muted">—</span>')}
      ${fieldRow('Cupom informado', offer.coupon_informed || '<span class="muted">—</span>')}
      ${fieldRow('Observações de frete', offer.shipping_notes || '<span class="muted">—</span>')}
      ${fieldRow('Outras observações', offer.other_notes || '<span class="muted">—</span>')}
      ${fieldRow('Riscos/dúvidas', offer.risks_or_doubts ? `<span class="risk">${escapeHtml(offer.risks_or_doubts)}</span>` : '<span class="muted">nenhum</span>')}
      ${fieldRow('Duplicidade detectada', offer.duplicate_of ? `<a href="/offers/${offer.duplicate_of}">ver oferta anterior</a>` : '<span class="muted">não</span>')}
      ${fieldRow(
        'Publicação',
        offer.publish_status === 'publicado'
          ? `<code>publicado</code> em ${offer.published_at ? escapeHtml(new Date(offer.published_at).toLocaleString('pt-BR')) : '—'} (${escapeHtml(offer.published_channel || '—')})`
          : `<code>${escapeHtml(offer.publish_status || 'nao_publicado')}</code>`
      )}
    </table>

    <h2>Copy 1</h2>
    <div class="copy-block">${nl2br(offer.copy_version_1)}</div>
    <h2>Copy 2</h2>
    <div class="copy-block">${nl2br(offer.copy_version_2)}</div>
    <h2>Copy 3</h2>
    <div class="copy-block">${nl2br(offer.copy_version_3)}</div>

    <form method="post" action="/offers/${offer.id}/update">
      <label for="affiliate_link">Ajustar link afiliado (se gerado/confirmado manualmente)</label>
      <input type="text" id="affiliate_link" name="affiliate_link" value="${escapeHtml(offer.affiliate_link)}">

      <label for="affiliate_validation_status">Status de validação do afiliado</label>
      <select id="affiliate_validation_status" name="affiliate_validation_status">
        ${['pendente', 'nao_confirmado', 'confirmado']
          .map(
            (opt) =>
              `<option value="${opt}" ${offer.affiliate_validation_status === opt ? 'selected' : ''}>${opt}</option>`
          )
          .join('')}
      </select>

      <label for="recommended_copy_whatsapp">Copy recomendada para WhatsApp</label>
      <select id="recommended_copy_whatsapp" name="recommended_copy_whatsapp">
        <option value="copy_version_1" ${offer.recommended_copy_whatsapp === offer.copy_version_1 ? 'selected' : ''}>Copy 1</option>
        <option value="copy_version_2" ${offer.recommended_copy_whatsapp === offer.copy_version_2 ? 'selected' : ''}>Copy 2</option>
        <option value="copy_version_3" ${offer.recommended_copy_whatsapp === offer.copy_version_3 ? 'selected' : ''}>Copy 3</option>
      </select>

      <label for="recommended_copy_telegram">Copy recomendada para Telegram</label>
      <select id="recommended_copy_telegram" name="recommended_copy_telegram">
        <option value="copy_version_1" ${offer.recommended_copy_telegram === offer.copy_version_1 ? 'selected' : ''}>Copy 1</option>
        <option value="copy_version_2" ${offer.recommended_copy_telegram === offer.copy_version_2 ? 'selected' : ''}>Copy 2</option>
        <option value="copy_version_3" ${offer.recommended_copy_telegram === offer.copy_version_3 ? 'selected' : ''}>Copy 3</option>
      </select>

      <label for="final_status">Status final (ajuste manual)</label>
      <select id="final_status" name="final_status">
        ${['pronto_para_publicar', 'revisar_antes_de_publicar', 'rejeitar']
          .map((opt) => `<option value="${opt}" ${offer.final_status === opt ? 'selected' : ''}>${opt}</option>`)
          .join('')}
      </select>

      <button type="submit">Salvar ajustes</button>
    </form>
  `
  );
}

function historyPage(offers) {
  const rows = offers
    .map(
      (offer) => `<tr>
        <td>${escapeHtml(new Date(offer.created_at).toLocaleString('pt-BR'))}</td>
        <td>${escapeHtml(offer.platform || '—')}</td>
        <td>${escapeHtml(offer.product_name || '—')}</td>
        <td>${statusBadge(offer.final_status)}</td>
        <td><a href="/offers/${offer.id}">ver</a></td>
      </tr>`
    )
    .join('');

  return layout(
    'Histórico de ofertas',
    `
    <h1>Histórico de ofertas processadas</h1>
    ${
      offers.length === 0
        ? '<p class="muted">Nenhuma oferta processada ainda.</p>'
        : `<table>
      <thead><tr><th>Data</th><th>Plataforma</th><th>Produto</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    }
  `
  );
}

function configFormFields(cfg) {
  return `
    <label>Affiliate ID</label>
    <input type="text" name="affiliate_id" value="${escapeHtml(cfg.affiliate_id)}">

    <label>Affiliate tag</label>
    <input type="text" name="affiliate_tag" value="${escapeHtml(cfg.affiliate_tag)}">

    <label>Token / API key (se existir)</label>
    <input type="text" name="api_token" value="${escapeHtml(cfg.api_token)}">

    <label>Método de geração de link afiliado</label>
    <select name="link_generation_method">
      ${Object.entries({
        nao_configurado: 'não configurado',
        troca_parametro: 'troca_parametro (NÃO recomendado — evidência oficial indica que não gera comissão)',
        manual: 'manual (colar link gerado na central de afiliados / barra de afiliados)',
        automatico_navegador: 'automático via navegador (imita o Gerador de Links real — requer sessão salva, ver /config/telegram)',
      })
        .map(
          ([opt, optLabel]) =>
            `<option value="${opt}" ${cfg.link_generation_method === opt ? 'selected' : ''}>${escapeHtml(optLabel)}</option>`
        )
        .join('')}
    </select>
    <p class="muted">
      ${
        cfg.platform === 'mercado_livre'
          ? `A própria central de ajuda do Mercado Livre afirma que divulgar um link comum — sem passar pelo Gerador de
      Links ou pela Barra de afiliados — não gera comissão. Isso inclui um link com parâmetro adicionado manualmente
      por este sistema. Trate "troca_parametro" como praticamente confirmado como não funcional (e com risco de
      suspensão de conta, segundo relatos de afiliados), não apenas "não confirmado". Use "manual" e cole o link
      gerado pela central oficial.`
          : `"troca_parametro" é sempre tratado como hipótese técnica não confirmada — nunca como garantia de comissão. Confirme o método oficial desta plataforma antes de ativar.`
      }
    </p>

    <label>Nome do parâmetro de rastreio (se método = troca_parametro)</label>
    <input type="text" name="tracking_param_name" value="${escapeHtml(cfg.tracking_param_name)}">

    <label>Valor do parâmetro de rastreio</label>
    <input type="text" name="tracking_param_value" value="${escapeHtml(cfg.tracking_param_value)}">

    <label>Modelo de URL oficial (se validado oficialmente)</label>
    <input type="text" name="official_url_pattern" value="${escapeHtml(cfg.official_url_pattern)}">

    <label>Link de exemplo</label>
    <input type="text" name="example_link" value="${escapeHtml(cfg.example_link)}">

    <label>Observações de rastreio</label>
    <input type="text" name="tracking_notes" value="${escapeHtml(cfg.tracking_notes)}">

    <label>Status da configuração</label>
    <select name="config_status">
      ${['pendente', 'configurado', 'nao_confirmado']
        .map((opt) => `<option value="${opt}" ${cfg.config_status === opt ? 'selected' : ''}>${opt}</option>`)
        .join('')}
    </select>

    <label>Domínios reconhecidos (separados por vírgula)</label>
    <input type="text" name="domains" value="${escapeHtml((cfg.domains || []).join(', '))}">
  `;
}

function sampleLinkDetectorBlock(cfg) {
  return `
    <h3>Detectar formato de link (referência, não é usado para gerar links)</h3>
    <p class="muted">
      Cole aqui UM link de afiliado real gerado pela sua central de afiliados/barra de afiliados do Mercado Livre
      só para registrar o formato usado pela sua conta. Isso é só um log de referência — o sistema NUNCA usa esse
      link (nem os valores detectados de matt_word/matt_tool) para gerar automaticamente o link de outro produto.
      Segundo o Mercado Livre, um link que não passou pelo gerador oficial não gera comissão — cole sempre o link
      real gerado, produto a produto, no campo "Ajustar link afiliado" da oferta.
    </p>
    <form method="post" action="/config/mercado_livre/sample-link">
      <label for="sample_link">Link de exemplo gerado pela central de afiliados</label>
      <input type="text" id="sample_link" name="sample_link" placeholder="https://meli.la/... ou link longo com matt_word/matt_tool">
      <button type="submit">Detectar formato</button>
    </form>
    <table class="card">
      ${fieldRow('Último formato detectado', cfg.detected_link_format || '<span class="muted">nenhum ainda</span>')}
      ${fieldRow('matt_word detectado', cfg.detected_matt_word || '<span class="muted">—</span>')}
      ${fieldRow('matt_tool detectado', cfg.detected_matt_tool || '<span class="muted">—</span>')}
      ${fieldRow('tag detectado', cfg.detected_tag || '<span class="muted">—</span>')}
      ${fieldRow(
        'Salvo em',
        cfg.sample_link_saved_at ? escapeHtml(new Date(cfg.sample_link_saved_at).toLocaleString('pt-BR')) : '<span class="muted">—</span>'
      )}
    </table>
  `;
}

function configPage(config) {
  return layout(
    'Configuração por plataforma',
    `
    <h1>Configuração por plataforma</h1>
    <p class="muted">Nenhum valor é presumido — preencha apenas o que você confirmar oficialmente em cada plataforma.</p>

    <div class="card">
      <h2>Mercado Livre</h2>
      <form method="post" action="/config/mercado_livre">
        ${configFormFields(config.mercado_livre)}
        <button type="submit">Salvar</button>
      </form>
      ${sampleLinkDetectorBlock(config.mercado_livre)}
    </div>

    <div class="card">
      <h2>Shopee <span class="muted">(fase futura, inativa no MVP)</span></h2>
      <form method="post" action="/config/shopee">
        ${configFormFields(config.shopee)}
        <button type="submit">Salvar</button>
      </form>
    </div>
  `
  );
}

function telegramConfigPage(appConfig) {
  const telegram = appConfig.telegram || {};
  const mlAutomation = appConfig.mercado_livre_automation || {};

  return layout(
    'Automação (Telegram)',
    `
    <h1>Automação via Telegram</h1>
    <p class="muted">
      Leitura dos canais-fonte e publicação no seu canal rodam automaticamente em segundo plano
      (ver <code>src/telegram/sourceReader.js</code> e <code>src/telegram/publisherWorker.js</code>).
      Essas credenciais (sessão do Telegram, token do bot) ficam só no <code>.env</code> da máquina onde
      o app roda — aqui você só gerencia quais canais monitorar e liga/desliga a automação.
    </p>
    <p class="risk">
      WhatsApp continua 100% manual — decisão deliberada, sem automação nenhuma nesse canal (ver
      docs/nova-versao-mvp-mercadolivre.md).
    </p>

    <form method="post" action="/config/telegram">
      <label for="source_chat_ids">Canais/grupos-fonte a monitorar (IDs separados por vírgula)</label>
      <input type="text" id="source_chat_ids" name="source_chat_ids" placeholder="-1001234567890, -1009876543210"
        value="${escapeHtml((telegram.source_chat_ids || []).join(', '))}">
      <p class="muted">Use <code>node scripts/listMyChats.js</code> (na sua máquina, depois do login) para descobrir os IDs.</p>

      <label for="publish_channel_id">Canal onde publicar (ID do seu canal próprio)</label>
      <input type="text" id="publish_channel_id" name="publish_channel_id" value="${escapeHtml(telegram.publish_channel_id)}">

      <label for="owner_chat_id">Seu chat pessoal (para alertas, ex.: sessão do Mercado Livre expirada)</label>
      <input type="text" id="owner_chat_id" name="owner_chat_id" value="${escapeHtml(telegram.owner_chat_id)}">

      <label><input type="checkbox" name="auto_publish_enabled" ${telegram.auto_publish_enabled ? 'checked' : ''}> Publicar automaticamente no canal (sem revisão humana)</label>

      <label><input type="checkbox" name="auto_generate_enabled" ${mlAutomation.auto_generate_enabled ? 'checked' : ''}> Gerar link do Mercado Livre automaticamente via navegador</label>

      <label for="min_delay_seconds">Atraso mínimo entre gerações de link (segundos)</label>
      <input type="text" id="min_delay_seconds" name="min_delay_seconds" value="${escapeHtml(mlAutomation.min_delay_seconds)}">

      <label for="max_delay_seconds">Atraso máximo entre gerações de link (segundos)</label>
      <input type="text" id="max_delay_seconds" name="max_delay_seconds" value="${escapeHtml(mlAutomation.max_delay_seconds)}">
      <p class="muted">Números de partida, não confirmados oficialmente pelo Mercado Livre — ajuste se perceber bloqueios.</p>

      <button type="submit">Salvar</button>
    </form>
  `
  );
}

module.exports = { layout, indexPage, offerPage, historyPage, configPage, telegramConfigPage, escapeHtml };
