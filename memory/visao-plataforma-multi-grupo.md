---
name: visao-plataforma-multi-grupo
description: Objetivo de longo prazo — transformar o bolão dos 4 amigos em plataforma multi-grupo para parceiros (com prêmios via WhatsApp)
metadata:
  type: project
---

O bolão (hoje single-tenant, 4 amigos fixos) tem como meta virar uma **plataforma multi-grupo**: parceiros comerciais (ex.: hamburguerias, bares) criam grupos, distribuem um **código de entrada**, e clientes entram só com **nome + telefone**, palpitam e disputam o ranking do grupo. Acertos rendem **prêmios/cupons entregues no WhatsApp**. Crescimento planejado por fases (parcerias → mais VPS → domínio próprio → Supabase Pro → WhatsApp Cloud API).

Plano técnico completo (fluxogramas Mermaid, modelo multi-tenant, auth por telefone+OTP via WhatsApp, ranking no servidor, fila de WhatsApp com throttle, roadmap de infra/custos por fase) está em `docs/ESCALABILIDADE.md`.

**Riscos/decisões-chave já documentados:**
- Maior risco de escala = **ban do número de WhatsApp** ao enviar em massa pela Evolution (Baileys). Mitigação: fila com throttle + migrar transacional (OTP/cupom) para a **WhatsApp Business Cloud API** oficial na Fase 2.
- `matches` permanece **global** (não escala com usuários) — ver [[notificacoes-whatsapp-evolution]].
- Ranking precisa sair do navegador ([calculateStandings](../src/utils/rules.ts)) para um worker server-side (`group_standings`).
