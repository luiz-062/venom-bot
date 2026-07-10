require('dotenv').config();
const express = require('express');

const { processOffer } = require('./lib/pipeline');
const { detectAffiliateLinkFormat } = require('./lib/affiliateLinkFormat');
const store = require('./store/jsonStore');
const { indexPage, offerPage, historyPage, configPage, telegramConfigPage } = require('./views/render');

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send(indexPage({ recentOffers: store.listOffers() }));
});

app.post('/offers', async (req, res, next) => {
  try {
    const rawText = req.body.raw_text || '';
    const offer = await processOffer(rawText);
    res.redirect(`/offers/${offer.id}`);
  } catch (error) {
    next(error);
  }
});

app.get('/offers', (req, res) => {
  res.send(historyPage(store.listOffers()));
});

app.get('/offers/:id', (req, res) => {
  const offer = store.getOffer(req.params.id);
  if (!offer) {
    res.status(404).send('Oferta não encontrada.');
    return;
  }
  res.send(offerPage(offer));
});

app.post('/offers/:id/update', async (req, res, next) => {
  try {
    const offer = store.getOffer(req.params.id);
    if (!offer) {
      res.status(404).send('Oferta não encontrada.');
      return;
    }

    const recommendedWhatsappKey = req.body.recommended_copy_whatsapp;
    const recommendedTelegramKey = req.body.recommended_copy_telegram;

    const patch = {
      affiliate_link: req.body.affiliate_link || '',
      affiliate_validation_status: req.body.affiliate_validation_status || offer.affiliate_validation_status,
      final_status: req.body.final_status || offer.final_status,
      recommended_copy_whatsapp: offer[recommendedWhatsappKey] || offer.recommended_copy_whatsapp,
      recommended_copy_telegram: offer[recommendedTelegramKey] || offer.recommended_copy_telegram,
    };

    await store.updateOffer(req.params.id, patch);
    res.redirect(`/offers/${req.params.id}`);
  } catch (error) {
    next(error);
  }
});

app.get('/config', (req, res) => {
  res.send(configPage(store.getAllPlatformConfig()));
});

app.post('/config/:platform', async (req, res, next) => {
  try {
    const { platform } = req.params;
    if (!['mercado_livre', 'shopee'].includes(platform)) {
      res.status(404).send('Plataforma desconhecida.');
      return;
    }

    const domains = String(req.body.domains || '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    await store.savePlatformConfig(platform, {
      affiliate_id: req.body.affiliate_id || '',
      affiliate_tag: req.body.affiliate_tag || '',
      api_token: req.body.api_token || '',
      link_generation_method: req.body.link_generation_method || 'nao_configurado',
      tracking_param_name: req.body.tracking_param_name || '',
      tracking_param_value: req.body.tracking_param_value || '',
      official_url_pattern: req.body.official_url_pattern || '',
      example_link: req.body.example_link || '',
      tracking_notes: req.body.tracking_notes || '',
      config_status: req.body.config_status || 'pendente',
      domains,
    });

    res.redirect('/config');
  } catch (error) {
    next(error);
  }
});

app.post('/config/mercado_livre/sample-link', async (req, res, next) => {
  try {
    const sampleLink = String(req.body.sample_link || '').trim();
    const detection = detectAffiliateLinkFormat(sampleLink);

    await store.savePlatformConfig('mercado_livre', {
      detected_link_format: detection.format,
      detected_matt_word: detection.detectedMattWord || '',
      detected_matt_tool: detection.detectedMattTool || '',
      detected_tag: detection.detectedTag || '',
      sample_link_saved_at: new Date().toISOString(),
    });

    res.redirect('/config');
  } catch (error) {
    next(error);
  }
});

app.get('/config/telegram', (req, res) => {
  res.send(telegramConfigPage(store.getAppConfig()));
});

app.post('/config/telegram', async (req, res, next) => {
  try {
    const sourceChatIds = String(req.body.source_chat_ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    await store.saveAppConfig({
      telegram: {
        source_chat_ids: sourceChatIds,
        publish_channel_id: req.body.publish_channel_id || '',
        owner_chat_id: req.body.owner_chat_id || '',
        auto_publish_enabled: req.body.auto_publish_enabled === 'on',
      },
      mercado_livre_automation: {
        auto_generate_enabled: req.body.auto_generate_enabled === 'on',
        min_delay_seconds: Number(req.body.min_delay_seconds) || 45,
        max_delay_seconds: Number(req.body.max_delay_seconds) || 120,
      },
    });

    res.redirect('/config/telegram');
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[server] erro não tratado:', error);
  res.status(500).send('Erro interno ao processar a solicitação.');
});

app.listen(PORT, () => {
  console.log(`[server] MVP de ofertas afiliadas rodando em http://localhost:${PORT}`);
});
