require("dotenv").config();
const venom = require("venom-bot");
const express = require("express");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const app = express();
app.use(require("body-parser").json());

async function downloadImageBuffer(imageUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch (error) {
    throw new Error("URL da imagem inválida");
  }

  if (!parsedUrl.protocol || !["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Protocolo não suportado para download da imagem");
  }

  const client = parsedUrl.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.get(parsedUrl, response => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = new URL(response.headers.location, parsedUrl);
        response.resume();
        downloadImageBuffer(redirectUrl.toString()).then(resolve).catch(reject);
        return;
      }

      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Download falhou com status ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: response.headers["content-type"] || "image/jpeg"
        });
      });
    });

    request.on("error", reject);
  });
}

venom.create().then(client => {
  app.post("/mensagem", async (req, res) => {
    const grupo = `${process.env.WA_GROUP}@g.us`;
    const { imagem, legenda } = req.body;

    try {
      if (imagem) {
        let imageData;
        try {
          imageData = await downloadImageBuffer(imagem);
        } catch (downloadError) {
          console.error("Erro ao baixar imagem:", downloadError);
          return res.status(422).send("Não foi possível baixar a imagem fornecida");
        }

        const base64Image = imageData.buffer.toString("base64");
        const dataUri = `data:${imageData.contentType};base64,${base64Image}`;
        await client.sendImageFromBase64(grupo, dataUri, "promo.jpg", legenda);
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
