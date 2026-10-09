import { AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild, signal } from '@angular/core';
import { bookingCalendarConfig, calEventPath } from './booking-calendar.config';

type EmbedStatus = 'loading' | 'ready' | 'error';
type CalFunction = (command: string, ...args: unknown[]) => void;
type CalWindow = Window & { Cal?: CalFunction & { ns?: Record<string, CalFunction> } };

@Component({
  selector: 'app-booking-calendar', standalone: true,
  templateUrl: './booking-calendar.component.html',
  styleUrl: './booking-calendar.component.css'
})
export class BookingCalendarComponent implements AfterViewInit, OnDestroy {
  @Output() availabilityChange = new EventEmitter<boolean>();
  @ViewChild('calHost') calHost?: ElementRef<HTMLDivElement>;

  readonly bookingUrl = bookingCalendarConfig.calEventUrl;
  readonly eventPath = calEventPath(this.bookingUrl);
  readonly configured = Boolean(this.eventPath);
  readonly status = signal<EmbedStatus>('loading');

  private embedScript?: HTMLScriptElement;
  private observer?: MutationObserver;
  private loadTimer?: ReturnType<typeof setTimeout>;

  ngAfterViewInit() {
    if (!this.eventPath || !this.calHost) return;
    const host = this.calHost.nativeElement;
    this.observer = new MutationObserver(() => {
      if (host.querySelector('iframe')) {
        this.status.set('ready');
        this.availabilityChange.emit(false);
        clearTimeout(this.loadTimer);
      }
    });
    this.observer.observe(host, { childList: true, subtree: true });

    const script = document.createElement('script');
    script.src = 'https://app.cal.com/embed/embed.js';
    script.async = true;
    script.onload = () => {
      const cal = (window as CalWindow).Cal;
      if (!cal) return this.fail();
      cal('init', 'mmbl-demo', { origin: 'https://cal.com' });
      const widget = cal.ns?.['mmbl-demo'];
      if (!widget) return this.fail();
      widget('inline', { elementOrSelector: '#mmbl-cal-inline', calLink: this.eventPath, layout: 'month_view' });
      widget('ui', { styles: { branding: { brandColor: '#16645e' } }, layout: 'month_view' });
    };
    script.onerror = () => this.fail();
    this.embedScript = script;
    this.loadTimer = setTimeout(() => this.fail(), 15000);
    document.head.append(script);
  }

  ngOnDestroy() {
    clearTimeout(this.loadTimer);
    this.observer?.disconnect();
    this.embedScript?.remove();
  }

  private fail() {
    if (this.status() === 'ready') return;
    clearTimeout(this.loadTimer);
    this.status.set('error');
    this.availabilityChange.emit(true);
  }
}
