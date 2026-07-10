const test = require('node:test');
const assert = require('node:assert/strict');

const { handleNewMessage } = require('../src/telegram/sourceReader');

function fakeEvent({ text, chatId }) {
  return { message: { message: text, chatId } };
}

test('handleNewMessage processes text from a configured source chat', async () => {
  const calls = [];
  const processOffer = async (text) => {
    calls.push(text);
    return { id: 'x' };
  };

  const event = fakeEvent({ text: 'Fone bom\nR$ 99,90\nhttps://www.mercadolivre.com.br/produto/MLB1', chatId: '-1001111' });
  const result = await handleNewMessage(event, { sourceChatIds: ['-1001111'], processOffer });

  assert.equal(calls.length, 1);
  assert.match(calls[0], /Fone bom/);
  assert.deepEqual(result, { id: 'x' });
});

test('handleNewMessage ignores messages from chats not in the configured source list', async () => {
  const processOffer = async () => {
    throw new Error('should not be called');
  };
  const event = fakeEvent({ text: 'oferta qualquer', chatId: '-1002222' });
  const result = await handleNewMessage(event, { sourceChatIds: ['-1001111'], processOffer });
  assert.equal(result, null);
});

test('handleNewMessage ignores everything when no source chats are configured yet', async () => {
  const processOffer = async () => {
    throw new Error('should not be called');
  };
  const event = fakeEvent({ text: 'oferta qualquer', chatId: '-1001111' });
  const result = await handleNewMessage(event, { sourceChatIds: [], processOffer });
  assert.equal(result, null);
});

test('handleNewMessage ignores messages with no text (e.g. photo without caption)', async () => {
  const processOffer = async () => {
    throw new Error('should not be called');
  };
  const event = fakeEvent({ text: undefined, chatId: '-1001111' });
  const result = await handleNewMessage(event, { sourceChatIds: ['-1001111'], processOffer });
  assert.equal(result, null);
});

test('handleNewMessage swallows a processOffer failure instead of throwing', async () => {
  const processOffer = async () => {
    throw new Error('boom');
  };
  const event = fakeEvent({ text: 'oferta', chatId: '-1001111' });
  const result = await handleNewMessage(event, { sourceChatIds: ['-1001111'], processOffer });
  assert.equal(result, null);
});
