import { Component, signal } from '@angular/core';
import { BookingCalendarComponent } from './booking-calendar.component';
import { bookingCalendarConfig, calEventPath } from './booking-calendar.config';
import { FormsModule, NgForm } from '@angular/forms';
import { contactConfig } from '../contact.config';

@Component({
  selector: 'app-workout-scheduler', standalone: true, imports: [FormsModule, BookingCalendarComponent],
  templateUrl: './workout-scheduler.component.html', styleUrl: './workout-scheduler.component.css'
})
export class WorkoutSchedulerComponent {
  calendarConnected = Boolean(calEventPath(bookingCalendarConfig.calEventUrl));
  calendarUnavailable = signal(false);
  model = { format: '', date: '', time: '', name: '', email: '', phone: '', notes: '', website: '' };
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  sending = signal(false);
  status = signal('');
  hasError = signal(false);
  deliveryFailed = signal(false);
  minDate = this.localDate(new Date());
  maxDate = this.localDate(new Date(new Date().setMonth(new Date().getMonth() + 6)));

  private localDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  requestDetails(): string {
    return [
      'Free demo scheduling request',
      `Training: ${this.model.format}`,
      `Preferred date: ${this.model.date}`,
      `Preferred time: ${this.model.time} (${this.timezone})`,
      `Name: ${this.model.name.trim()}`,
      `Email: ${this.model.email.trim()}`,
      `Phone: ${this.model.phone.trim() || 'Not provided'}`,
      `Notes: ${this.model.notes.trim() || 'None'}`,
    ].join('\n');
  }

  emailDraftUrl(): string {
    return `mailto:${contactConfig.recipient}?subject=${encodeURIComponent('Free demo request — Modern Motion Body Lab')}&body=${encodeURIComponent(this.requestDetails())}`;
  }

  async copyRequest() {
    try {
      await navigator.clipboard.writeText(this.requestDetails());
      this.status.set('Request copied. Paste it into an email to modernmotionbodylab@gmail.com and press Send.');
    } catch {
      this.status.set('Copy was unavailable. Please use the email draft link or email modernmotionbodylab@gmail.com.');
    }
  }

  async submit(form: NgForm) {
    if (this.sending()) return;
    this.hasError.set(false);
    this.deliveryFailed.set(false);
    this.status.set('');
    const date = this.model.date;
    if (form.invalid || !['Online', 'In person'].includes(this.model.format) ||
        !date || date < this.localDate(new Date()) || date > this.maxDate ||
        !this.model.name.trim() || !this.model.time) {
      form.control.markAllAsTouched();
      this.hasError.set(true);
      this.status.set('Choose a training type, date, and time, and enter your name and a valid email.');
      return;
    }
    if (this.model.website) return;
    this.sending.set(true);
    this.status.set('Sending your free demo request…');
    try {
      const response = await fetch(contactConfig.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: this.model.name.trim(), email: this.model.email.trim(), phone: this.model.phone.trim(),
          training_type: this.model.format, preferred_date: date,
          preferred_time: this.model.time, timezone: this.timezone,
          notes: this.model.notes.trim(), _subject: 'New free demo request — Modern Motion Body Lab',
          _template: 'table'
        }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok || !(result.success === true || result.success === 'true')) throw new Error('Request rejected');
      this.status.set('Request sent. We’ll email you to confirm whether that time is available.');
      form.resetForm({ format: '', date: '', time: '', name: '', email: '', phone: '', notes: '', website: '' });
    } catch {
      this.hasError.set(true);
      this.deliveryFailed.set(true);
      this.status.set('The website could not send your request. Your details are still here. Use the email option below to send it directly.');
    } finally { this.sending.set(false); }
  }
}
