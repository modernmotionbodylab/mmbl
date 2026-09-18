import { Component, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { contactConfig } from './contact.config';

@Component({ selector: 'app-root', standalone: true, imports: [FormsModule], templateUrl: './app.component.html' })
export class AppComponent {
  model = { name: '', email: '', phone: '', interest: 'General enquiry', message: '', website: '' };
  sending = signal(false);
  status = signal('');
  hasError = signal(false);

  async submit(form: NgForm) {
    if (this.sending()) return;
    this.hasError.set(false);
    if (form.invalid || !this.model.name.trim() || this.model.message.trim().length < 10) {
      form.control.markAllAsTouched();
      this.hasError.set(true);
      this.status.set('Please enter your name, a valid email, and a message of at least 10 characters.');
      return;
    }
    if (this.model.website) return;
    if (!contactConfig.endpoint) {
      this.hasError.set(true);
      this.status.set(`Online enquiries are being connected. Please email ${contactConfig.recipient} directly for now.`);
      return;
    }
    this.sending.set(true);
    this.status.set('Sending your enquiry…');
    try {
      const response = await fetch(contactConfig.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: this.model.name.trim(), email: this.model.email.trim(), phone: this.model.phone.trim(), interest: this.model.interest, message: this.model.message.trim(), _subject: 'New Modern Motion Body Lab enquiry', _template: 'table' }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok || !(result.success === true || result.success === 'true')) throw new Error('Submission rejected');
      this.status.set('Thank you. Your enquiry has been submitted. We’ll reply using the email you provided.');
      form.resetForm({ name: '', email: '', phone: '', interest: 'General enquiry', message: '', website: '' });
    } catch {
      this.hasError.set(true);
      this.status.set(`We couldn’t confirm your submission. Your message is still here. Please try again or email ${contactConfig.recipient}.`);
    } finally { this.sending.set(false); }
  }
}
