# Venom Bot - Envio de Promoções com Imagem e Legenda

Este bot utiliza o Venom para enviar automaticamente promoções com link de afiliado, imagem do produto e legenda personalizada para um grupo no WhatsApp.

## Enviar Promoção (POST /mensagem)

- `imagem`: URL da imagem do produto
- `legenda`: Mensagem formatada (com emojis, preço, cupom, etc.)

### Exemplo de corpo JSON:
```json
{
  "imagem": "https://cf.shopee.com.br/file/abcd1234.jpg",
  "legenda": "🔥 É HOJE!\nFone JBL 510BT\nR$149,90\nCupom: SHP10JUN\nhttps://shopee.com.br/...?af_siteid=18176160001"
}
```