# Nova versão do projeto de afiliados — Análise e escopo do MVP (Mercado Livre)

Documento inicial de produto/arquitetura para orientar o desenvolvimento da próxima versão do sistema de automação de ofertas afiliadas. Serve como base para transformar em backlog técnico.

## 0. Diagnóstico da versão anterior (este repositório)

O código atual (`index.js`, `shopeeApi.js`, `whatsappBot.js`, `database.js`) é um bot 100% automático para Shopee:

- Busca produtos via API oficial da Shopee (`search_item`), sem depender de nenhuma fonte de terceiros (grupos/canais).
- Gera link de afiliado via API oficial (`generate_links`), com fallback de UTM quando a API falha — **esse fallback é justamente o padrão de risco que a nova versão não pode tratar como garantia**: o próprio código já reconhece isso com `console.warn('Aplicando fallback de tracking.')`.
- Usa `venom-bot` para autenticar uma sessão do WhatsApp Web e **enviar mensagens automaticamente** para grupos próprios, sem revisão humana antes da publicação.
- Mantém deduplicação por `item_id` em SQLite (`sent_offers`) — isso funcionou bem e deve ser reaproveitado como conceito.
- Tem logging razoável de decisões (filtro, duplicidade, erros, pausa/retomada).
- Não tem separação por plataforma de fato (só existe Shopee), não tem Telegram, não tem revisão manual, não tem copy variável (mensagem é sempre o mesmo template fixo).

**Conclusão prática:** o que funcionou tecnicamente (dedup, logs, envio a grupos próprios, geração de link com fallback declarado) deve ser mantido como *conceito*, mas a arquitetura de "automação total sem revisão" e a dependência de `venom-bot`/WhatsApp Web como fonte de leitura não devem voltar no MVP. A nova versão troca automação de ponta a ponta por um fluxo manual/semi-automático com humano no loop, e troca Shopee-first por Mercado-Livre-first.

---

## 1. Escopo enxuto do MVP

**Objetivo único do MVP:** provar que uma mensagem de oferta colada manualmente pode virar, de forma confiável, uma publicação própria com link afiliado do Mercado Livre, pronta para copiar e colar no WhatsApp e no Telegram.

Dentro do MVP:

- Entrada manual de texto (colar mensagem bruta).
- Extração de dados da oferta (link, produto, preço, cupom, observações).
- Identificação e limpeza do link do Mercado Livre.
- Tentativa de geração de link afiliado próprio, com status explícito de confiança.
- Verificação mínima (link abre).
- Reescrita em copy própria (3 variações).
- Saída estruturada com status final (pronto / revisar / rejeitar).
- Registro em histórico simples para evitar repetição de produto/link.
- Mercado Livre apenas. Shopee fica fora, só com os campos de configuração já previstos na estrutura de dados.

Fora do MVP (ver seção 9 para lista completa): scraping, leitura automática de WhatsApp/Telegram, envio automático, imagens de terceiros, filtros comerciais, múltiplas plataformas ativas, dashboard.

---

## 2. Fluxo operacional passo a passo

1. **Entrada manual** — usuário cola o texto bruto da oferta em um formulário/campo único (planilha, painel simples ou CLI/bot pessoal). Sem parsing pré-formatado exigido.
2. **Extração de dados** — o sistema tenta extrair: link(s), nome do produto, preço, preço "de/por" quando houver, cupom, observações de frete, plataforma de origem. Se um campo não for encontrado, fica vazio — nunca é inventado.
3. **Detecção de plataforma e link** — o sistema varre a mensagem em busca de URLs, identifica se alguma pertence a domínios do Mercado Livre (a lista exata de domínios/subdomínios válidos — `mercadolivre.com.br`, `mercadolibre.com`, encurtadores oficiais como `mercadolivre.com/sec/...`, etc. — **precisa ser confirmada na documentação oficial antes de codar**, não deve ser presumida).
4. **Limpeza do link** — remove parâmetros de rastreio de terceiros e resolve redirecionadores conhecidos quando tecnicamente possível, chegando a um "link limpo do produto".
5. **Geração do link afiliado** — segue a ordem de segurança da seção 5. Resultado sempre rotulado com o método usado e o nível de confiança.
6. **Validação mínima** — confere se o link final abre (HTTP 200 / redirecionamento válido). Não valida preço, estoque, cupom nem comissão (ver seção 5).
7. **Geração de copy** — gera 3 versões de mensagem própria, curtas e informais, sem reaproveitar frases da mensagem original.
8. **Montagem da saída estruturada** — consolida todos os campos da seção 3, incluindo as 3 copies, a recomendada para WhatsApp, a recomendada para Telegram, e o status final.
9. **Checagem de duplicidade** — compara o link limpo/produto contra o histórico local; se já processado recentemente, sinaliza no campo de riscos/observações (não bloqueia automaticamente).
10. **Revisão humana** — usuário olha o resultado, escolhe a copy, ajusta se quiser, e copia/cola manualmente no grupo de WhatsApp e no canal de Telegram.
11. **Registro final** — ao publicar (ou descartar), o usuário marca o status no histórico, fechando o ciclo daquele item.

Nenhuma etapa publica automaticamente. A saída é sempre "pronta para copiar", nunca "enviada pelo sistema".

---

## 3. Estrutura de dados recomendada

Um registro por oferta processada (`offer`), por exemplo em uma tabela `offers` (SQLite serve bem para o MVP, seguindo o padrão que já funcionava na versão anterior):

```
offers
├── id                          (chave interna)
├── created_at
├── updated_at
├── platform                    (ex.: "mercado_livre" | "shopee" — shopee inativa no MVP)
├── raw_input                   (texto colado original, guardado só para depuração/auditoria interna, nunca reexibido como saída pública)
├── product_name
├── original_link               (link exatamente como veio na mensagem)
├── clean_link                  (link do produto após limpeza/resolução de redirecionamento)
├── affiliate_link              (link final gerado, ou vazio se pendente)
├── affiliate_method             (ex.: "api_oficial" | "painel_oficial" | "troca_parametro_hipotese" | "pendente_manual")
├── affiliate_validation_status  (ex.: "confirmado" | "nao_confirmado" | "pendente")
├── link_open_check              (ex.: "ok" | "falhou" | "nao_testado")
├── price_informed
├── coupon_informed
├── shipping_notes
├── other_notes
├── risks_or_doubts              (texto livre: ex. "link duvidoso", "produto sensível", "possível duplicidade")
├── duplicate_of                 (id de outro registro, se detectado como repetição)
├── copy_version_1
├── copy_version_2
├── copy_version_3
├── recommended_copy_whatsapp    (referência a uma das 3 versões, com eventual ajuste)
├── recommended_copy_telegram
├── final_status                 (ex.: "pronto_para_publicar" | "revisar_antes_de_publicar" | "rejeitar")
└── published_at / published_channel (preenchido manualmente após publicação, opcional no MVP)
```

Tabela auxiliar de configuração por plataforma (ver seção 8), separada da tabela de ofertas, para não misturar dado transacional com dado de configuração.

---

## 4. Campos mínimos para planilha/banco/painel

Se o MVP começar em planilha (o mais rápido para validar), as colunas mínimas por linha são:

| Coluna | Obrigatória no MVP? |
| --- | --- |
| Data/hora | sim |
| Plataforma | sim |
| Nome do produto | sim (se extraído) |
| Link original | sim |
| Link limpo | sim |
| Link afiliado | sim (mesmo que vazio/pendente) |
| Método de geração do link | sim |
| Status da validação do link | sim |
| Preço informado | não (quando existir) |
| Cupom informado | não (quando existir) |
| Observações de frete | não |
| Riscos/dúvidas | sim |
| Copy 1 / Copy 2 / Copy 3 | sim |
| Copy recomendada WhatsApp | sim |
| Copy recomendada Telegram | sim |
| Status final | sim |
| Publicado? (sim/não/onde) | manual, opcional |

Essa mesma tabela vira o schema do banco quando o projeto sair da planilha.

---

## 5. Regras de validação mínima

Ordem de segurança para geração do link afiliado (não pular etapas):

1. **Método oficial validado pela plataforma** — API de afiliados, painel oficial de geração de link, ou gerador oficial do programa de afiliados do Mercado Livre. **A existência, o nome exato e o comportamento dessa ferramenta precisam ser confirmados na documentação/painel oficial do Mercado Livre antes de qualquer implementação** — este documento não presume que ela funcione de determinada forma.
2. Se não houver acesso a um método oficial confirmado, usar **troca de parâmetro na URL apenas como hipótese técnica**, nunca como premissa de que a comissão será computada. Todo link gerado por esse método deve ser marcado com `affiliate_method = "troca_parametro_hipotese"` e `affiliate_validation_status = "nao_confirmado"`.
3. Se não for possível gerar nenhum link com confiança mínima, o campo `affiliate_link` fica vazio/pendente e o item é marcado para geração manual.
4. **Nunca** apresentar um link como "afiliado válido" só porque ele abre no navegador. Abrir com sucesso comprova apenas que a URL é alcançável, não que carrega parâmetro de comissão.

Checklist de validação mínima obrigatória no MVP (todos os itens, nesta ordem):

1. Existe pelo menos um link na mensagem colada?
2. O link pertence ao Mercado Livre (domínio confirmado)?
3. Foi possível limpar/resolver redirecionamentos?
4. Foi possível gerar ou preparar o link afiliado (por algum dos métodos da lista acima)?
5. O link final abre (checagem HTTP simples)?
6. O status de validação foi registrado explicitamente (não deduzido implicitamente)?
7. Havendo qualquer dúvida em qualquer etapa anterior, o item é marcado `revisar_antes_de_publicar` — nunca `pronto_para_publicar` por omissão.

**O que essa validação mínima NÃO garante** (deixar isso explícito para o usuário final do sistema, inclusive na interface): preço atualizado, cupom ativo, produto disponível, frete vantajoso, comissão válida, rastreamento correto, vendedor confiável. Tudo isso é backlog futuro (seção 10).

---

## 6. Regras de geração de copy

- A copy final **nunca** é a mensagem original reescrita palavra por palavra — é uma nova redação a partir dos dados extraídos (produto, preço, cupom, observações), não do texto de terceiros.
- Tom: engraçado, informal, curto, "cara de grupo de oferta". Evitar textos longos, evitar clichês de spam ("CORRE QUE VAI ACABAR!!!" repetido sempre).
- Gerar sempre **3 versões** com estrutura diferente entre si (ex.: uma abre com o preço, outra abre com uma piada/gancho, outra abre com o nome do produto), para reduzir repetição de padrão ao longo do tempo.
- Preço em destaque quando disponível; cupom exibido apenas se foi de fato extraído da mensagem original (nunca inventado).
- CTA simples e direto (ex.: "corre lá", "bora garantir o seu"), sem prometer desconto, frete grátis ou vantagem que não foi confirmada na validação.
- Nunca simular autoria da curadoria original: não usar frases como "vi no grupo tal" de forma que pareça repasse do conteúdo de outro afiliado; o produto é tratado como referência comercial, a publicação é autoral.
- Sem uso de imagem de terceiros — a copy deve funcionar bem só com o preview automático que WhatsApp/Telegram geram a partir do link final.

---

## 7. Pontos de risco técnico, comercial e de política

**Técnico**
- Domínios e formatos de link do Mercado Livre variam (encurtadores, redirecionamentos, links de app vs. web) — a lógica de "reconhecer link do ML" precisa de teste com casos reais antes de confiar nela.
- Extração de texto bagunçado (emojis, múltiplos links, comentários misturados) é inerentemente imprecisa; o sistema deve assumir que vai errar às vezes e favorecer "campo vazio" a "campo inventado".
- Checar apenas "o link abre" é um teste fraco: não decide gerar falso positivo de item "pronto" — por isso o status final default deve tender a `revisar_antes_de_publicar`.

**Comercial**
- Link com troca de parâmetro sem confirmação oficial pode simplesmente não gerar comissão nenhuma — isso é risco de negócio direto, não só técnico. Precisa ficar visível no status (`nao_confirmado`) até validar com resultado real de comissão no painel do Mercado Livre.
- Preço e cupom mudam rápido; qualquer copy publicada com dado desatualizado é risco de reputação com o público do grupo/canal próprio.

**Política/Plataforma**
- Regras do programa de afiliados do Mercado Livre (o que é permitido em geração de link, uso de marca, formas de divulgação) **precisam ser confirmadas na documentação oficial do Mercado Livre** antes de automatizar qualquer parte da geração de link — este documento não presume nenhuma regra específica.
- Reaproveitar integralmente a mensagem/autoria de outro afiliado é risco de política das plataformas de origem (grupos/canais de terceiros) e de ética comercial — por isso a extração é de dados objetivos, não de texto.
- Automação de envio em grupos de terceiros e leitura automática de WhatsApp/Telegram são explicitamente descartadas no MVP por risco de ToS e de instabilidade técnica (dependência de WhatsApp Web não-oficial, como já era o caso da versão anterior com `venom-bot`).

---

## 8. O que deve ser configurável por plataforma

Tabela de configuração (`platform_config`), uma linha por plataforma, com todos os campos abaixo — sem nenhum valor presumido no código:

- `platform` (ex.: mercado_livre, shopee)
- `affiliate_id`
- `affiliate_tag`
- `api_token` / `api_key` (quando existir)
- `link_generation_method` (oficial_api | painel_oficial | troca_parametro_hipotese | manual)
- `official_url_pattern` (só preenchido se confirmado oficialmente como válido)
- `example_link`
- `tracking_notes`
- `config_status` (ex.: "configurado" | "pendente" | "não confirmado")

No MVP, apenas a linha `mercado_livre` precisa estar preenchida (mesmo que parcialmente); a linha `shopee` pode existir vazia/"pendente" só para não quebrar a separação por plataforma que já era um ponto forte da versão anterior.

---

## 9. O que deve ficar fora do MVP

- Scraping pesado de grupos/canais.
- Leitura automática de WhatsApp ou Telegram.
- Qualquer dependência de WhatsApp Web não-oficial para *ler* mensagens (a experiência anterior com `venom-bot` já mostrou o padrão de risco: reconexões, `CONFLICT`, sessões caindo).
- Envio automático de mensagem sem revisão humana — inclusive para grupos/canais próprios.
- Cópia literal de mensagem de outro afiliado como publicação final.
- Reaproveitamento direto de imagem de terceiros.
- Qualquer afirmação de comissão garantida sem confirmação oficial.
- Troca de parâmetro tratada como garantia (só como hipótese marcada).
- Filtros comerciais obrigatórios (desconto mínimo, preço máximo, categoria, limite diário, ranking).
- Dashboard sofisticado — planilha ou tela simples já resolve o MVP.
- Múltiplas integrações de plataforma simultâneas antes do fluxo básico (Mercado Livre) estar validado.
- Publicação automática em grupos/canais de terceiros (e mesmo em próprios, ver item de envio automático acima).
- Suporte a Shopee funcional (fica só como estrutura de configuração prevista, não implementada).

---

## 10. Backlog técnico futuro, dividido por fases

**Fase 1 — MVP (este documento)**
Fluxo manual completo: colar → extrair → identificar link → gerar link afiliado (com status de confiança) → validar abertura → gerar 3 copies → saída estruturada → histórico simples de duplicidade.

**Fase 2 — Reforço de confiança e produtividade**
- Validação de comissão real via confirmação no painel/relatório oficial do programa de afiliados (não só "link abre").
- Verificação de preço atual, disponibilidade e cupom ativo (via meios oficiais, a confirmar o que a plataforma permite).
- Histórico de duplicidade mais robusto (janela de tempo, fuzzy match por produto).
- Ativação da Shopee com o mesmo padrão de configuração já previsto na estrutura de dados.

**Fase 3 — Semi-automação assistida**
- Entrada semi-automática (ex.: encaminhar mensagem para um bot pessoal que já pré-processa, mas ainda exige confirmação humana antes de publicar).
- Publicação assistida (um clique para copiar/enviar) apenas para canais/grupos próprios, com controle de frequência.
- Filtros comerciais opcionais (desconto mínimo, categoria, limite diário) como configuração, não como obrigação.

**Fase 4 — Automação controlada**
- Publicação automática apenas em canais/grupos próprios, com limites de frequência e trava de revisão amostral.
- Ranking de melhores ofertas.
- Detecção de categoria sensível/risco de produto.
- Template visual/card de oferta, se ainda fizer sentido frente ao preview nativo de WhatsApp/Telegram.

Cada fase só deve iniciar depois que a fase anterior tiver os critérios de sucesso (seção 12) atingidos.

---

## 11. Perguntas pendentes antes do desenvolvimento

1. Qual é exatamente o programa/mecanismo oficial de afiliados do Mercado Livre disponível hoje para a conta do usuário (API, painel, gerador de link, ou nenhum deles)? Precisa ser confirmado diretamente no Mercado Livre/Mercado Livre Afiliados.
2. Trocar parâmetro de URL do Mercado Livre realmente é reconhecido pelo sistema de afiliados para fins de comissão, ou existe um único método oficial de geração de link que precisa ser usado? Não presumir — confirmar oficialmente.
3. Quais domínios/formatos de link (incluindo encurtadores) o Mercado Livre usa hoje, para a etapa de identificação e limpeza de link funcionar corretamente?
4. A conta de afiliado do usuário já está ativa e aprovada no Mercado Livre, ou isso ainda precisa ser resolvido antes de qualquer teste real de comissão?
5. Onde e como o usuário vai efetivamente "colar a mensagem" no MVP — planilha (Google Sheets/Excel), formulário simples, ou uma interface mínima? Isso muda a stack de implementação.
6. O histórico de duplicidade deve considerar apenas o link/produto, ou também uma janela de tempo (ex.: não repetir o mesmo produto em X dias)?
7. Quem, além do usuário, vai revisar/publicar as ofertas? Isso importa para decidir se basta uma planilha compartilhada ou se vale um mini-painel com login.
8. Existe algum limite de volume esperado por dia/semana no MVP, para dimensionar se planilha resolve ou se já vale banco de dados desde o início?

---

## 12. Critérios objetivos para saber se o MVP deu certo

- Pelo menos N ofertas reais (sugestão inicial: 20–30) processadas de ponta a ponta — da mensagem colada até a publicação manual — sem falha grosseira de extração.
- Nenhuma publicação final for cópia literal ou quase literal da mensagem original (checagem manual amostral).
- Taxa de itens marcados `revisar_antes_de_publicar` ou `rejeitar` é conhecida e aceitável (não é sinal de falha ter itens revisados — é sinal de falha se o sistema marcar `pronto_para_publicar` de forma errada com frequência).
- Ao menos uma comissão real for confirmada no painel oficial do Mercado Livre a partir de um link gerado pelo sistema — isso é o único jeito de validar de verdade o método de geração de link (nenhuma validação automática do MVP substitui essa confirmação).
- O usuário consegue, na prática, copiar e colar a saída no grupo de WhatsApp e no canal de Telegram sem precisar reescrever a mensagem do zero na maioria dos casos.
- Nenhuma reclamação/flag de política recebida das plataformas (Mercado Livre, WhatsApp, Telegram) durante o período de teste.
- O histórico evita repetição perceptível do mesmo produto em publicações próximas.

Se esses critérios forem atingidos com o fluxo manual, aí sim faz sentido avançar para a Fase 2/3 do backlog.
