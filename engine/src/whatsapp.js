// WhatsApp Cloud API sender. Business-initiated messages (outside the customer's 24h window)
// must use a template approved in Meta Business Manager; free text works only inside the window.
export function createWhatsApp({
  token = process.env.WHATSAPP_TOKEN,
  phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID,
  apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0',
  dryRun = process.env.WHATSAPP_DRY_RUN === '1' || !token,
  fetchImpl = fetch,
  log = console,
} = {}) {
  const sent = [];

  async function send({ to, text, template }) {
    const body = template
      ? {
          messaging_product: 'whatsapp', to, type: 'template',
          template: {
            name: template.name,
            language: { code: template.language || 'he' },
            components: [{ type: 'body', parameters: (template.params || []).map((t) => ({ type: 'text', text: String(t) })) }],
          },
        }
      : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };

    if (dryRun) {
      sent.push({ to, text, template });
      log.info?.(`[whatsapp:dry-run] -> ${to}: ${text ?? `template ${template.name}`}`);
      return { dryRun: true };
    }
    const res = await fetchImpl(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }

  return { send, sent, dryRun };
}
