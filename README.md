# Raijin Sushi — app de pedidos

App próprio de delivery do **Raijin Sushi (Ivoti/RS)**, com a identidade da marca, painel de gestão completo, CRM, motoboys e atendimento pelo WhatsApp.

Feito com Next.js 16 (App Router), TypeScript, Tailwind CSS 4 e SQLite embutido no Node (`node:sqlite`). Roda local sem configurar banco.

## Rodar local

Precisa de Node 22.5+ (testado no 26).

```bash
npm install
cp .env.example .env.local
npm run dev -- -p 3333
```

No primeiro start o banco (`data/raijin.db`) é criado com:
- o cardápio real do Raijin (69 itens, 13 categorias);
- bairros de Ivoti com taxas de exemplo;
- 2 motoboys e 2 cupons de exemplo;
- clientes e pedidos **fictícios** para o CRM e os relatórios terem dados. Desligue com `SEED_DEMO=0`.

Para recomeçar do zero, apague a pasta `data/`.

| Onde | O quê |
| --- | --- |
| `/` | Cardápio e pedido (cliente) |
| `/checkout`, `/pedido/[código]`, `/conta` | Carrinho, acompanhamento em tempo real, histórico e "pedir de novo" |
| `/painel` | Painel da equipe. O login de desenvolvimento usa `ADMIN_EMAIL` / `ADMIN_PASSWORD` do `.env.local`. |
| `/motoboy` | App do motoboy. Os motoboys de exemplo são criados pelo seed; o telefone e o PIN de cada um ficam em `src/lib/server/seed.ts`. |

Sem WhatsApp configurado, o código de login aparece na tela (só em desenvolvimento) e as mensagens ficam na inbox do painel como "simulada". Em **Painel → WhatsApp** dá para simular mensagens de clientes e testar o robô.

## O que tem

**Cliente (PWA, mobile-first)**
- Cardápio com busca sem acento, abas por categoria e "os mais pedidos" calculado das vendas.
- Produto com variações (ex.: Hot 10/20 un), adicionais com mínimo e máximo, "Monte seu poke" em etapas e observações.
- Carrinho e checkout com entrega por bairro ou retirada; o pedido mínimo é aplicado.
- Pagamento por Pix, cartão online, dinheiro (com troco) ou maquininha.
- Cupom e cashback.
- Agendamento quando a loja está fechada.
- Login pelo WhatsApp (código de 6 dígitos), sem senha.
- Acompanhamento em tempo real, código de entrega, avaliação e "pedir de novo".

**Painel**
- **Pedidos:** kanban em tempo real com som de novo pedido, aceite com tempo estimado, atribuição de motoboy, comanda para impressora 80 mm, cancelamento com motivo e pedido manual (telefone, balcão ou WhatsApp).
- **Cardápio:**
  - produtos com foto, preço, promoção com prazo, selos, peças, tempo de preparo, SKU e estoque do dia;
  - pausar em um clique, variações e grupos de adicionais reutilizáveis;
  - categorias que podem ser reordenadas;
  - ações em massa (reajuste em % ou R$, pausar, duplicar) e histórico de preços.
- **Motoboys:** cadastro, regra de pagamento (fixo, % da taxa ou diária) e status em turno, disponível ou em rota. O **acerto do turno** mostra entregas, valor a pagar, dinheiro em mãos e saldo.
- **Clientes (CRM):** segmentos automáticos (novos, recorrentes, VIP, em risco, sumidos, aniversariantes). A ficha tem métricas, favoritos, pedidos, conversas, tags, notas, opt-in e ajuste de cashback. **Campanhas** no WhatsApp por segmento, só para quem aceitou receber.
- **WhatsApp:**
  - inbox com vários atendentes e a ficha do cliente e os pedidos ao lado;
  - respostas rápidas com `/`, notas internas, assumir, resolver e devolver ao robô;
  - robô de entrada (pedido, status, horários, atendente) e saída com "PARAR";
  - mensagens automáticas a cada mudança de status do pedido.
- **Cupons**, **Caixa** (abertura, sangria, suprimento e fechamento com conferência) e **Relatórios** (faturamento, ticket médio, recompra, tempos, itens, pagamentos, cupons, exportação CSV).
- **Configurações:** horários com vários turnos, fechamento temporário, bairros e taxas, formas de pagamento, cashback, dados da loja e textos das mensagens.

**Motoboy (`/motoboy`)**
- Entra com telefone e PIN, abre e fecha turno.
- Vê as entregas com o que cobrar e o troco.
- Rota no Maps, botões de ligar e WhatsApp, Peguei, Cheguei e Entregue (com o código do cliente).
- Registra ocorrências; a localização é enviada durante o turno.

Papéis da equipe: `admin`, `gerente`, `atendente`, `cozinha`. Cozinha e atendente podem pausar itens, mas não editam preços.

## Produção — o que falta configurar

1. **Banco:** o SQLite precisa de **disco persistente**. Dá para rodar num VPS, Railway ou Fly.io com volume, usando `DATABASE_PATH`. Na **Vercel** (serverless, sem disco) é preciso migrar para Postgres/Supabase. O SQL de `src/lib/server/db.ts` foi escrito para ser portável.
2. **Fotos:** o upload local salva em `public/uploads`. Em produção, trocar por Supabase Storage ou S3 em `src/app/api/admin/upload/route.ts`.
3. **WhatsApp:**
   - criar o app na Meta (WhatsApp Business Platform) e preencher `WHATSAPP_*`;
   - apontar o webhook para `https://SEU_DOMINIO/api/whatsapp/webhook`;
   - aprovar **templates** equivalentes às mensagens automáticas e ao código de login, porque fora da janela de 24 h a Meta só aceita template.
4. **Pagamentos:** o Pix hoje é simulado (há o botão "simular pagamento" em dev). Falta integrar Mercado Pago ou Asaas: criar a cobrança no checkout e confirmar via webhook (`payment_status = 'pago'`). O estorno no cancelamento está marcado como `TODO` em `src/lib/server/orders.ts`.
5. **Segurança:** em produção são obrigatórios `SESSION_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
6. **Dados de exemplo:** revisar com o restaurante os preços, os adicionais do poke e as taxas por bairro. Os adicionais e as taxas são exemplos.

## Estrutura

```
src/
  app/
    (loja)/            cardápio, checkout, pedido, conta
    painel/            telas do painel
    motoboy/           app do motoboy
    api/               rotas (públicas, /admin, /courier, /whatsapp/webhook)
  components/          UI (loja, painel, motoboy)
  lib/
    server/            banco, seed, pedidos, CRM, motoboys, financeiro, WhatsApp, sessões
    format.ts hours.ts client.ts
```
