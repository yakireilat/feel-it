import { normalizePhone } from '../util.js';
import { approveLatestReview } from './reviews.js';
import { runDigest } from './digest.js';

const STOP = /^(הסר|הסרה|הסירו|הסירו אותי|הפסק|stop|unsubscribe)[.!]?$/i;
const START = /^(התחל|הצטרף|start)[.!]?$/i;

const OWNER_HELP = 'פקודות זמינות:\n1 – אישור ופרסום התגובה האחרונה לביקורת\nתגובה: <טקסט> – פרסום נוסח משלכם\nסיכום – הסיכום היומי עכשיו';

// A WhatsApp message arrived at a client's number.
export async function handleInbound(ctx, client, { from, text = '', at }) {
  const phone = normalizePhone(from);
  if (!phone) return { status: 'ignored' };
  const body = String(text).trim();
  const when = at ?? ctx.now();
  if (ctx.isOwner(client, phone)) {
    const delivered = await ctx.ownerWrote(client, when);
    // A plain reply to the ping just means "show me"; commands still run.
    if (delivered && !isCommand(body)) return { status: 'delivered_pending', delivered };
    return handleOwner(ctx, client, body);
  }

  // Opt-out is honored immediately and for every future automated message (Israeli anti-spam law).
  if (STOP.test(body)) {
    await ctx.send(client, 'opt_out_confirm', { to: phone, text: `הוסרתם מרשימת ההודעות של ${client.name}. כדי לחזור, שלחו "התחל".` });
    ctx.store.updateState(client.id, (s) => ({ ...s, optOut: { ...s.optOut, [phone]: when } }));
    ctx.store.append(client.id, 'opt_out', { from: phone }, when);
    return { status: 'opted_out' };
  }
  if (START.test(body)) {
    ctx.store.updateState(client.id, (s) => {
      const { [phone]: _, ...rest } = s.optOut ?? {};
      return { ...s, optOut: rest };
    });
    ctx.store.append(client.id, 'opt_in', { from: phone }, when);
    await ctx.send(client, 'opt_in_confirm', { to: phone, text: `חזרתם לרשימת ההודעות של ${client.name}. תודה!` });
    return { status: 'opted_in' };
  }

  // Everything else goes to a person: the owner gets the message and a one-tap link to answer.
  ctx.store.append(client.id, 'inbound', { from: phone }, when);
  await ctx.send(client, 'inbound_forward', {
    to: client.ownerPhone,
    text: `💬 הודעה חדשה מלקוח (${phone}):\n${body.slice(0, 1000) || '(הודעה ללא טקסט)'}\n\nלמענה: https://wa.me/${phone}`,
  });
  return { status: 'forwarded' };
}

const isCommand = (body) => body === '1' || body === 'אשר' || body === 'סיכום' || /^תגובה\s*:/.test(body);

async function handleOwner(ctx, client, body) {
  const reply = (text) => ctx.send(client, 'owner_reply', { to: client.ownerPhone, text });

  if (body === '1' || body === 'אשר' || /^תגובה\s*:/.test(body)) {
    const custom = /^תגובה\s*:/.test(body) ? body.replace(/^תגובה\s*:/, '') : null;
    try {
      const result = await approveLatestReview(ctx, client, custom);
      if (result.status === 'none_pending') await reply('אין כרגע ביקורת שממתינה לאישור.');
      else if (result.status === 'manual') await reply(`החיבור לגוגל עדיין לא הוגדר, אז יש לפרסם ידנית. זו התגובה:\n\n${result.comment}`);
      else await reply(`✅ התגובה פורסמה בגוגל${result.author ? ` (לביקורת של ${result.author})` : ''}.`);
      return { status: result.status };
    } catch (err) {
      await ctx.recordError(client, 'review_reply', err);
      await reply('לא הצלחנו לפרסם את התגובה כרגע. הצוות שלנו קיבל התראה ומטפל בזה.');
      return { status: 'failed' };
    }
  }
  if (body === 'סיכום') {
    await runDigest(ctx, client, { markDone: false });
    return { status: 'digest_sent' };
  }
  await reply(OWNER_HELP);
  return { status: 'help' };
}
