import Stripe from 'npm:stripe@22';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
const signingSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET');
const paymentLinkId = Deno.env.get('STRIPE_IN_PERSON_PAYMENT_LINK_ID');
const creditsPerPayment = Number(Deno.env.get('SEMI_PRIVATE_SESSIONS_PER_PAYMENT'));
const validDays = Number(Deno.env.get('CREDIT_VALID_DAYS'));
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const configured = Boolean(stripeSecret && signingSecret && paymentLinkId && supabaseUrl && serviceKey &&
  Number.isInteger(creditsPerPayment) && creditsPerPayment > 0 && Number.isInteger(validDays) && validDays > 0);
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const db = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) : null;

function expiration() { return new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString(); }
async function grant(email: string, source: string, subscriptionId: string | null) {
  if (!db) throw new Error('Database unavailable');
  const { error } = await db.from('training_credits').insert({
    member_email: email.trim().toLowerCase(), plan: 'semi_private', credits_total: creditsPerPayment,
    expires_at: expiration(), stripe_source: source, stripe_subscription_id: subscriptionId,
  });
  if (error && error.code !== '23505') throw error;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!configured || !stripe || !signingSecret || !db) return new Response('Booking payments are not configured', { status: 503 });
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Signature required', { status: 400 });
  let event: Stripe.Event;
  try {
    // Stripe signatures require the unmodified request body.
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, signingSecret, undefined, cryptoProvider);
  } catch { return new Response('Invalid signature', { status: 400 }); }
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== 'paid' || session.payment_link !== paymentLinkId) return Response.json({ received: true });
      const email = session.customer_details?.email || session.customer_email;
      if (!email) throw new Error('Paid checkout lacks member email');
      const subscription = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
      await grant(email, `checkout:${session.id}`, subscription);
    } else if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      // Initial subscription invoices are covered by checkout.session.completed.
      if (invoice.billing_reason !== 'subscription_cycle') return Response.json({ received: true });
      const parent = invoice.parent as { subscription_details?: { subscription?: string | { id: string } } } | null;
      const subscription = parent?.subscription_details?.subscription;
      const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;
      if (!subscriptionId) throw new Error('Renewal invoice lacks subscription ID');
      const { data: original, error } = await db.from('training_credits')
        .select('member_email').eq('stripe_subscription_id', subscriptionId).order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (error) throw error;
      if (!original) return Response.json({ received: true });
      await grant(original.member_email, `invoice:${invoice.id}`, subscriptionId);
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error('Stripe booking grant failed', event.id, error);
    return new Response('Grant failed; Stripe should retry', { status: 500 });
  }
});
