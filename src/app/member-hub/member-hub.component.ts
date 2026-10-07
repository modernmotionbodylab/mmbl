import { Component, computed, signal } from '@angular/core';
import { LiveHubComponent } from './live-hub.component';
import { liveBookingConfig } from './live.config';

type Workout = { id: string; title: string; startsAt: Date; endsAt: Date; location: string; capacity: number; taken: number };
const SAMPLE_CREDITS = 8;
@Component({ selector: 'app-member-hub', standalone: true, imports: [LiveHubComponent], templateUrl: './member-hub.component.html', styleUrl: './member-hub.component.css' })
export class MemberHubComponent {
  liveConfigured = Boolean(liveBookingConfig.supabaseUrl && liveBookingConfig.supabasePublishableKey);
  // Demonstration only: no payments, personal data, or real reservations are stored.
  active = signal(false);
  bookings = signal<string[]>([]);
  message = signal('');
  weekOffset = signal(0);
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  credits = computed(() => SAMPLE_CREDITS - this.bookings().length);
  private start = new Date();
  constructor() { this.start.setHours(0, 0, 0, 0); }
  sessions: Workout[] = Array.from({length: 28}, (_, day) => {
    const date = new Date(this.start); date.setDate(date.getDate() + day);
    if (date.getDay() === 0) return [];
    return [7, 12, 18].map((hour, index) => {
      const startsAt = new Date(date); startsAt.setHours(hour, 0, 0, 0);
      return {id: `${day}-${hour}`, title: index === 1 ? 'Strength & mobility' : 'Semi-private strength', startsAt, endsAt: new Date(startsAt.getTime() + 45 * 60000), location: 'Example studio', capacity: 4, taken: (day + index) % 5};
    });
  }).flat().filter(workout => workout.startsAt.getTime() > Date.now());
  days = computed(() => Array.from({length: 7}, (_, i) => { const date = new Date(this.start); date.setDate(date.getDate() + this.weekOffset() * 7 + i); return date; }));
  upcoming = computed(() => this.sessions.filter(workout => this.bookings().includes(workout.id)));
  label(date: Date) { return date.toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'}); }
  time(date: Date) { return date.toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'}); }
  onDay(date: Date) { return this.sessions.filter(workout => workout.startsAt.toDateString() === date.toDateString()); }
  isBooked(id: string) { return this.bookings().includes(id); }
  spots(workout: Workout) { return workout.capacity - workout.taken - (this.isBooked(workout.id) ? 1 : 0); }
  openDemo() { this.active.set(true); this.message.set('Example membership opened with 8 session credits. No payment was made.'); }
  reset() { this.bookings.set([]); this.weekOffset.set(0); this.message.set('Demo reset. You have 8 sample session credits again.'); }
  book(workout: Workout) {
    if (!this.active() || this.isBooked(workout.id) || this.spots(workout) <= 0 || this.credits() <= 0) return;
    this.bookings.update(ids => [...ids, workout.id]);
    this.message.set(`Demo booking added for ${this.label(workout.startsAt)} at ${this.time(workout.startsAt)}. This is not a real reservation.`);
  }
  cancel(id: string) {
    this.bookings.update(ids => ids.filter(value => value !== id));
    this.message.set('Demo booking cancelled. Your sample credit has been returned.');
  }
}
