const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.OFFERS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-test-'));

const store = require('../src/store/jsonStore');
const { publishOffer, sendAlert } = require('../src/telegram/publisher');

test('publishOffer sends the recommended Telegram copy to the configured channel', async () => {
  await store.saveAppConfig({ telegram: { publish_channel_id: '-100999' } });

  const calls = [];
  const sendMessage = async (chatId, text) => {
    calls.push({ chatId, text });
    return { message_id: 1 };
  };

  const offer = { id: 'x', recommended_copy_telegram: 'confira essa oferta!' };
  await publishOffer(offer, { sendMessage });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].chatId, '-100999');
  assert.equal(calls[0].text, 'confira essa oferta!');
});

test('publishOffer throws a clear error when no publish channel is configured', async () => {
  await store.saveAppConfig({ telegram: { publish_channel_id: '' } });
  const offer = { id: 'y', recommended_copy_telegram: 'oi' };
  await assert.rejects(() => publishOffer(offer, { sendMessage: async () => {} }), /canal de publicação/i);
});

test('sendAlert is a no-op (does not throw) when no owner_chat_id is configured', async () => {
  await store.saveAppConfig({ telegram: { owner_chat_id: '' } });
  const calls = [];
  await sendAlert('algo quebrou', { sendMessage: async (...args) => calls.push(args) });
  assert.equal(calls.length, 0);
});

test('sendAlert sends to the configured owner chat', async () => {
  await store.saveAppConfig({ telegram: { owner_chat_id: '12345' } });
  const calls = [];
  await sendAlert('algo quebrou', { sendMessage: async (chatId, text) => calls.push({ chatId, text }) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].chatId, '12345');
  assert.equal(calls[0].text, 'algo quebrou');
});

test('publishOffer serializes concurrent sends with a minimum gap between them', async () => {
  await store.saveAppConfig({ telegram: { publish_channel_id: '-100999' } });
  const timestamps = [];
  const sendMessage = async () => {
    timestamps.push(Date.now());
  };

  const offerA = { id: 'a', recommended_copy_telegram: 'A' };
  const offerB = { id: 'b', recommended_copy_telegram: 'B' };

  await Promise.all([publishOffer(offerA, { sendMessage }), publishOffer(offerB, { sendMessage })]);

  assert.equal(timestamps.length, 2);
  assert.ok(timestamps[1] - timestamps[0] >= 1000, `expected >=1000ms gap, got ${timestamps[1] - timestamps[0]}ms`);
});
