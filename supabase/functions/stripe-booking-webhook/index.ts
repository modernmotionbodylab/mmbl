import Stripe from 'npm:stripe@22';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET');
const onlineLink = Deno.env.get('STRIPE_ONLINE_LINK_ID');
const inPersonLink = Deno.env.get('STRIPE_IN_PERSON_LINK_ID');
const onlineCredits = Number(Deno.env.get('ONLINE_CREDITS_PER_PAYMENT'));
const inPersonCredits = Number(Deno.env.get('IN_PERSON_CREDITS_PER_PAYMENT'));
const validDays = Number(Deno.env.get('CREDIT_VALID_DAYS'));
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const validCount = (count: number) => Number.isInteger(count) && count > 0;
const configured = Boolean(stripeSecret && webhookSecret && onlineLink && inPersonLink && supabaseUrl && serviceKey &&
  validCount(onlineCredits) && validCount(inPersonCredits) && validCount(validDays));
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;
const db = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey, {auth:{persistSession:false}}) : null;
const cryptoProvider = Stripe.createSubtleCryptoProvider();

type Format = 'online' | 'in_person';
async function grant(email: string, format: Format, source: string, subscriptionId: string | null) {
  if (!db) throw new Error('Database unavailable');
  const count = format === 'online' ? onlineCredits : inPersonCredits;
  const { error } = await db.from('booking_entitlements').insert({
    member_email: email.trim().toLowerCase(), training_format: format,
    credits_remaining: count, active_until: new Date(Date.now() + validDays * 86400000).toISOString(),
    stripe_source: source, stripe_subscription_id: subscriptionId,
  });
  if (error && error.code !== '23505') throw error; // A retried event must not grant twice.
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
  if (!configured || !stripe || !webhookSecret || !db) return new Response('Booking payments are not configured', {status:503});
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Signature required', {status:400});
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, webhookSecret, undefined, cryptoProvider);
  } catch { return new Response('Invalid signature', {status:400}); }
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== 'paid') return Response.json({received:true});
      const format: Format | null = session.payment_link === onlineLink ? 'online' :
        session.payment_link === inPersonLink ? 'in_person' : null;
      if (!format) return Response.json({received:true});
      const email = session.customer_details?.email || session.customer_email;
      if (!email) throw new Error('Paid checkout lacks member email');
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
      await grant(email, format, `checkout:${session.id}`, subscriptionId);
    } else if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason !== 'subscription_cycle') return Response.json({received:true});
      const parent = invoice.parent as {subscription_details?: {subscription?: string | {id:string}}} | null;
      const subscription = parent?.subscription_details?.subscription;
      const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;
      if (!subscriptionId) throw new Error('Renewal invoice lacks subscription ID');
      const {data: original, error} = await db.from('booking_entitlements')
        .select('member_email, training_format').eq('stripe_subscription_id', subscriptionId)
        .order('created_at', {ascending:true}).limit(1).maybeSingle();
      if (error) throw error;
      if (original) await grant(original.member_email, original.training_format, `invoice:${invoice.id}`, subscriptionId);
    }
    return Response.json({received:true});
  } catch (error) {
    console.error('Booking credit grant failed for signed event', event.id, error);
    return new Response('Grant failed; Stripe may retry', {status:500});
  }
});
