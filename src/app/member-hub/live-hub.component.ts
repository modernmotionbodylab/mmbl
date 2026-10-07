import { Component, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { liveBookingConfig } from './live.config';

type Workout = { id: string; title: string; starts_at: string; ends_at: string; location: string; capacity: number; spots_left: number; booked: boolean };
type Balance = { credits_remaining: number; expires_at: string };
@Component({ selector: 'app-live-hub', standalone: true, imports: [FormsModule], templateUrl: './live-hub.component.html', styleUrl: './member-hub.component.css' })
export class LiveHubComponent implements OnInit {
  private db: SupabaseClient = createClient(liveBookingConfig.supabaseUrl, liveBookingConfig.supabasePublishableKey);
  email = '';
  code = '';
  sent = signal(false);
  signedIn = signal(false);
  loading = signal(false);
  message = signal('');
  isError = signal(false);
  sessions = signal<Workout[]>([]);
  balances = signal<Balance[]>([]);
  credits = computed(() => this.balances().reduce((total, balance) => total + balance.credits_remaining, 0));
  weekOffset = signal(0);
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  days = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({length: 7}, (_, i) => { const date = new Date(today); date.setDate(today.getDate() + this.weekOffset() * 7 + i); return date; });
  });
  upcoming = computed(() => this.sessions().filter(workout => workout.booked));
  label(date: Date | string) { return new Date(date).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'}); }
  time(date: string) { return new Date(date).toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'}); }
  onDay(date: Date) { return this.sessions().filter(workout => new Date(workout.starts_at).toDateString() === date.toDateString()); }
  async ngOnInit() {
    const { data } = await this.db.auth.getSession();
    if (data.session?.user) {
      this.email = data.session.user.email ?? '';
      this.signedIn.set(true);
      await this.refresh();
    }
  }
  private async run(action: () => Promise<void>) {
    if (this.loading()) return;
    this.loading.set(true); this.message.set(''); this.isError.set(false);
    try { await action(); }
    catch (error) { this.isError.set(true); this.message.set(error instanceof Error ? error.message : 'Please try again.'); }
    finally { this.loading.set(false); }
  }
  sendCode() { return this.run(async () => {
    const { error } = await this.db.auth.signInWithOtp({ email: this.email.trim(), options: { shouldCreateUser: true } });
    if (error) throw error;
    this.sent.set(true); this.message.set('Check your email for your sign-in code.');
  }); }
  verify() { return this.run(async () => {
    const { data, error } = await this.db.auth.verifyOtp({ email: this.email.trim(), token: this.code.trim(), type: 'email' });
    if (error) throw error;
    if (!data.user) throw new Error('Could not sign in. Please request a fresh code.');
    this.signedIn.set(true); this.code = '';
    await this.load();
  }); }
  async signOut() {
    await this.db.auth.signOut(); this.signedIn.set(false); this.sent.set(false);
    this.sessions.set([]); this.balances.set([]); this.email = ''; this.message.set('Signed out.');
  }
  private async load() {
    const [schedule, balance] = await Promise.all([this.db.rpc('member_schedule'), this.db.rpc('member_balance')]);
    if (schedule.error) throw schedule.error;
    if (balance.error) throw balance.error;
    this.sessions.set((schedule.data ?? []) as Workout[]);
    this.balances.set((balance.data ?? []) as Balance[]);
  }
  refresh() { return this.run(async () => { await this.load(); this.message.set('Your membership and schedule are up to date.'); }); }
  book(id: string) { return this.run(async () => {
    const { error } = await this.db.rpc('book_workout', { workout_id: id });
    if (error) throw error;
    await this.load(); this.message.set('Workout booked. You can see it below.');
  }); }
  cancel(id: string) { return this.run(async () => {
    const { error } = await this.db.rpc('cancel_workout', { workout_id: id });
    if (error) throw error;
    await this.load(); this.message.set('Booking cancelled. Your session credit is available again.');
  }); }
  paymentUrl = liveBookingConfig.paymentUrl;
}
