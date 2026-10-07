import { Component, EventEmitter, HostListener, OnDestroy, Output, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { bookingCalendarConfig } from './booking-calendar.config';

@Component({
  selector: 'app-booking-calendar', standalone: true,
  templateUrl: './booking-calendar.component.html',
  styleUrl: './booking-calendar.component.css'
})
export class BookingCalendarComponent implements OnDestroy {
  private sanitizer = inject(DomSanitizer);
  private loadTimer?: ReturnType<typeof setTimeout>;
  private frameReady = false;
  @Output() availabilityChange = new EventEmitter<boolean>();
  configured = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(bookingCalendarConfig.appsScriptUrl);
  bookingCalendarUrl = bookingCalendarConfig.appsScriptUrl;
  scriptUrl: SafeResourceUrl | null = this.configured
    ? this.sanitizer.bypassSecurityTrustResourceUrl(bookingCalendarConfig.appsScriptUrl) : null;
  frameHeight = signal(1180);
  unavailable = signal(false);

  onFrameLoad() {
    if (this.frameReady) return;
    clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(() => {
      this.unavailable.set(true);
      this.availabilityChange.emit(true);
    }, 12000);
  }

  ngOnDestroy() {
    clearTimeout(this.loadTimer);
  }

  @HostListener('window:message', ['$event'])
  onFrameMessage(event: MessageEvent) {
    if (!this.configured ||
        !/^https:\/\/(?:script\.google\.com|(?:[A-Za-z0-9-]+\.)?googleusercontent\.com)$/.test(event.origin) ||
        event.data?.type !== 'mmbl:booking-height') return;
    const height = Number(event.data.height);
    if (Number.isFinite(height)) {
      this.frameReady = true;
      clearTimeout(this.loadTimer);
      this.unavailable.set(false);
      this.availabilityChange.emit(false);
      this.frameHeight.set(Math.min(4000, Math.max(650, Math.ceil(height) + 24)));
    }
  }
}
