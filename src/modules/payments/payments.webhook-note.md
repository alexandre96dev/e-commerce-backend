# Stripe Webhook

Endpoint: POST /api/v1/payments/webhook/stripe

Eventos tratados:
- checkout.session.completed
- payment_intent.succeeded
- payment_intent.payment_failed

Regras:
- Assinatura obrigatoria (stripe-signature)
- Confirmacao de pagamento apenas via webhook
- Idempotencia basica: ignora pagamentos ja marcados como succeeded
