require("dotenv").config();
const venom = require("venom-bot");
const express = require("express");
const app = express();
app.use(require("body-parser").json());

venom.create().then(client => {
  app.post("/mensagem", async (req, res) => {
    const grupo = `${process.env.WA_GROUP}@g.us`;
    const { imagem, legenda } = req.body;

    try {
      if (imagem) {
        await client.sendImage(grupo, imagem, "promo.jpg", legenda);
      } else {
        await client.sendText(grupo, legenda);
      }
      res.sendStatus(200);
    } catch (err) {
      console.error("Erro ao enviar:", err);
      res.status(500).send("Erro ao enviar");
    }
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("✅ Venom Bot rodando na porta " + port));
});