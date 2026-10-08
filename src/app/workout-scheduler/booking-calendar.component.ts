import { Component, EventEmitter, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { bookingCalendarConfig } from './booking-calendar.config';

type TrainingFormat = 'in_person' | 'online';
type AvailabilityStatus = 'loading' | 'ready' | 'error';

interface DemoSlot {
  format: TrainingFormat;
  start: string;
  end: string;
  spotsLeft: number;
}

interface AvailabilityResult {
  slots?: DemoSlot[];
  error?: string;
}

@Component({
  selector: 'app-booking-calendar', standalone: true,
  templateUrl: './booking-calendar.component.html',
  styleUrl: './booking-calendar.component.css'
})
export class BookingCalendarComponent implements OnInit, OnDestroy {
  @Output() availabilityChange = new EventEmitter<boolean>();
  configured = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(bookingCalendarConfig.appsScriptUrl);
  bookingCalendarUrl = bookingCalendarConfig.appsScriptUrl;
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  format = signal<TrainingFormat>('in_person');
  week = signal(0);
  status = signal<AvailabilityStatus>('loading');
  slots = signal<DemoSlot[]>([]);
  linkCopied = signal(false);
  private requestNumber = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private activeScript?: HTMLScriptElement;
  private activeCallback?: string;

  ngOnInit() {
    if (this.configured) {
      this.refresh();
      this.refreshTimer = setInterval(() => {
        if (!document.hidden) this.refresh();
      }, 30000);
    } else {
      this.status.set('error');
    }
  }

  ngOnDestroy() {
    clearInterval(this.refreshTimer);
    this.cleanupRequest();
  }

  private cleanupRequest() {
    clearTimeout(this.timer);
    this.activeScript?.remove();
    this.activeScript = undefined;
    if (this.activeCallback) {
      delete (window as unknown as Record<string, unknown>)[this.activeCallback];
      this.activeCallback = undefined;
    }
  }

  private dateAt(index: number): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + this.week() * 7 + index);
    return date;
  }

  days() {
    return Array.from({ length: 7 }, (_, index) => {
      const date = this.dateAt(index);
      return { key: date.toDateString(), label: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) };
    });
  }

  weekLabel() {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${this.dateAt(0).toLocaleDateString(undefined, options)} – ${this.dateAt(6).toLocaleDateString(undefined, options)}`;
  }

  visibleSlots(dayKey: string): DemoSlot[] {
    return this.slots().filter(slot => slot.format === this.format() && new Date(slot.start).toDateString() === dayKey);
  }

  timeLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  changeWeek(amount: number) {
    this.week.set(Math.max(0, Math.min(12, this.week() + amount)));
    this.refresh();
  }

  async copyLink() {
    try {
      await navigator.clipboard.writeText(this.bookingCalendarUrl);
      this.linkCopied.set(true);
    } catch {
      this.linkCopied.set(false);
    }
  }

  refresh() {
    if (!this.configured) return;
    this.cleanupRequest();
    const requestId = ++this.requestNumber;
    this.status.set('loading');
    const callback = `mmblAvailability_${Date.now()}_${requestId}`;
    this.activeCallback = callback;
    const params = new URLSearchParams({
      mode: 'availability', callback,
      from: this.dateAt(0).toISOString(), until: this.dateAt(7).toISOString()
    });
    const script = document.createElement('script');
    this.activeScript = script;
    script.src = `${this.bookingCalendarUrl}?${params.toString()}`;
    script.async = true;
    (window as unknown as Record<string, unknown>)[callback] = (result: AvailabilityResult) => {
      if (requestId !== this.requestNumber) return;
      this.cleanupRequest();
      if (!result || result.error || !Array.isArray(result.slots)) {
        this.status.set('error');
        this.availabilityChange.emit(true);
        return;
      }
      const from = this.dateAt(0).getTime();
      const until = this.dateAt(7).getTime();
      const slots = result.slots.filter(slot =>
        (slot.format === 'online' || slot.format === 'in_person') &&
        Number.isFinite(Date.parse(slot.start)) && Number.isFinite(Date.parse(slot.end)) &&
        Date.parse(slot.start) >= from && Date.parse(slot.start) < until &&
        Number.isInteger(slot.spotsLeft) && slot.spotsLeft >= 0 && slot.spotsLeft <= 3
      );
      this.slots.set(slots);
      this.status.set('ready');
      this.availabilityChange.emit(false);
    };
    script.onerror = () => {
      if (requestId !== this.requestNumber) return;
      this.cleanupRequest();
      this.status.set('error');
      this.availabilityChange.emit(true);
    };
    this.timer = setTimeout(() => {
      if (requestId !== this.requestNumber) return;
      this.cleanupRequest();
      this.status.set('error');
      this.availabilityChange.emit(true);
    }, 20000);
    document.head.append(script);
  }
}
