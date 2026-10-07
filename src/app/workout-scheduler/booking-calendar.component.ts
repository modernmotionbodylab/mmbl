import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { bookingCalendarConfig } from './booking-calendar.config';

type Format = 'online' | 'in_person';
type Slot = { id: string; training_format: Format; starts_at: string; ends_at: string; location: string; spots_left: number; booked_by_me: boolean };
type Credit = { training_format: Format; credits_remaining: number; active_until: string };
@Component({ selector: 'app-booking-calendar', standalone: true, imports: [FormsModule], templateUrl: './booking-calendar.component.html', styleUrl: './booking-calendar.component.css' })
export class BookingCalendarComponent implements OnInit, OnDestroy {
  readonly bookingCalendarConfig = bookingCalendarConfig;
  configured = Boolean(bookingCalendarConfig.supabaseUrl && bookingCalendarConfig.publishableKey);
  private db: SupabaseClient | null = this.configured ? createClient(bookingCalendarConfig.supabaseUrl, bookingCalendarConfig.publishableKey) : null;
  private refreshTimer?: ReturnType<typeof setInterval>;
  email = '';
  code = '';
  selectedId = signal<string | null>(null);
  codeSent = signal(false);
  signedIn = signal(false);
  busy = signal(false);
  message = signal('');
  error = signal(false);
  slots = signal<Slot[]>([]);
  credits = signal<Credit[]>([]);
  format = signal<Format>('in_person');
  weekOffset = signal(0);
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  days = computed(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + this.weekOffset() * 7);
    return Array.from({length: 7}, (_, i) => { const date = new Date(start); date.setDate(start.getDate() + i); return date; });
  });
  totalCredits = computed(() => this.credits().filter(credit => credit.training_format === this.format()).reduce((sum, credit) => sum + credit.credits_remaining, 0));
  myBookings = computed(() => this.slots().filter(slot => slot.booked_by_me));
  daySlots(date: Date) { return this.slots().filter(slot => slot.training_format === this.format() && new Date(slot.starts_at).toDateString() === date.toDateString()); }
  dayLabel(date: Date | string) { return new Date(date).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'}); }
  time(date: string) { return new Date(date).toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'}); }

  async ngOnInit() {
    if (!this.db) return;
    const { data } = await this.db.auth.getSession();
    if (data.session?.user) { this.signedIn.set(true); this.email = data.session.user.email || ''; }
    await this.refresh();
    this.refreshTimer = setInterval(() => { if (document.visibilityState === 'visible') void this.load(); }, 30000);
  }
  ngOnDestroy() { if (this.refreshTimer) clearInterval(this.refreshTimer); }
  private async load() {
    if (!this.db) return;
    const { data, error } = await this.db.rpc('available_workouts');
    if (error) { this.error.set(true); this.message.set('The calendar is temporarily unavailable. Please try Refresh.'); return; }
    this.slots.set((data || []) as Slot[]);
    if (this.signedIn()) {
      const credits = await this.db.rpc('member_credits');
      if (!credits.error) this.credits.set((credits.data || []) as Credit[]);
    }
  }
  async refresh() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(false); this.message.set('');
    try { await this.load(); } finally { this.busy.set(false); }
  }
  startBooking(id: string) {
    if (!this.signedIn()) { this.selectedId.set(id); this.message.set('Sign in with your email below to reserve this spot.'); return; }
    void this.book(id);
  }
  private async run(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(false); this.message.set('');
    try { await action(); }
    catch (e) { this.error.set(true); this.message.set(e instanceof Error ? e.message : 'Please try again.'); }
    finally { this.busy.set(false); }
  }
  sendCode() { return this.run(async () => {
    if (!this.db) return;
    const { error } = await this.db.auth.signInWithOtp({email:this.email.trim(), options:{shouldCreateUser:true}});
    if (error) throw error;
    this.codeSent.set(true); this.message.set('Check your email for your sign-in code.');
  }); }
  verifyCode() { return this.run(async () => {
    if (!this.db) return;
    const { data, error } = await this.db.auth.verifyOtp({email:this.email.trim(), token:this.code.trim(), type:'email'});
    if (error) throw error;
    if (!data.user) throw new Error('Could not sign in. Please request a fresh code.');
    this.signedIn.set(true); this.code = ''; this.selectedId.set(null);
    await this.load(); this.message.set('Signed in. Choose an available workout to book.');
  }); }
  async signOut() {
    await this.db?.auth.signOut(); this.signedIn.set(false); this.email = ''; this.code = '';
    this.codeSent.set(false); this.credits.set([]); this.selectedId.set(null); await this.refresh();
  }
  book(id: string) { return this.run(async () => {
    if (!this.db) return;
    const { error } = await this.db.rpc('book_workout', {workout_id:id});
    if (error) throw error;
    await this.load(); this.message.set('Your spot is booked. It appears under Your workouts.');
  }); }
  cancel(id: string) { return this.run(async () => {
    if (!this.db) return;
    const { error } = await this.db.rpc('cancel_workout', {workout_id:id});
    if (error) throw error;
    await this.load(); this.message.set('Booking cancelled. Your spot is available again.');
  }); }
  canBook(slot: Slot) { return !slot.booked_by_me && slot.spots_left > 0 && (!this.signedIn() || !bookingCalendarConfig.requirePayment || this.totalCredits() > 0); }
}
