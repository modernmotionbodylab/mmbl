import { Component, HostListener, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { bookingCalendarConfig } from './booking-calendar.config';

@Component({
  selector: 'app-booking-calendar', standalone: true,
  templateUrl: './booking-calendar.component.html',
  styleUrl: './booking-calendar.component.css'
})
export class BookingCalendarComponent {
  private sanitizer = inject(DomSanitizer);
  configured = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(bookingCalendarConfig.appsScriptUrl);
  bookingCalendarUrl = bookingCalendarConfig.appsScriptUrl;
  scriptUrl: SafeResourceUrl | null = this.configured
    ? this.sanitizer.bypassSecurityTrustResourceUrl(bookingCalendarConfig.appsScriptUrl) : null;
  frameHeight = signal(1180);

  @HostListener('window:message', ['$event'])
  onFrameMessage(event: MessageEvent) {
    if (!this.configured ||
        !/^https:\/\/(?:script\.google\.com|(?:[A-Za-z0-9-]+\.)?googleusercontent\.com)$/.test(event.origin) ||
        event.data?.type !== 'mmbl:booking-height') return;
    const height = Number(event.data.height);
    if (Number.isFinite(height)) this.frameHeight.set(Math.min(4000, Math.max(650, Math.ceil(height) + 24)));
  }
}
