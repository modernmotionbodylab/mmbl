import { AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild, signal } from '@angular/core';
import { bookingCalendarConfig, calEventPath } from './booking-calendar.config';

type EmbedStatus = 'loading' | 'ready' | 'error';
type CalFunction = ((...args: unknown[]) => void) & {
  loaded?: boolean;
  q?: unknown[][];
  ns?: Record<string, CalFunction>;
  config?: Record<string, unknown>;
};
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

    this.loadTimer = setTimeout(() => this.fail(), 15000);

    // Cal.com's embed expects this queue to exist before embed.js is loaded.
    const bootstrap = ((...args: unknown[]) => {
      if (!bootstrap.loaded) {
        bootstrap.ns = {};
        bootstrap.q = [];
        const script = document.createElement('script');
        script.src = 'https://app.cal.com/embed/embed.js';
        script.async = true;
        script.onerror = () => this.fail();
        this.embedScript = script;
        document.head.append(script);
        bootstrap.loaded = true;
      }
      if (args[0] === 'init' && typeof args[1] === 'string') {
        const namespace = args[1];
        const widget = ((...queued: unknown[]) => widget.q?.push(queued)) as CalFunction;
        widget.q = [];
        bootstrap.ns![namespace] ||= widget;
        bootstrap.ns![namespace].q?.push(args);
        bootstrap.q!.push(['initNamespace', namespace]);
        return;
      }
      bootstrap.q!.push(args);
    }) as CalFunction;

    const calWindow = window as CalWindow;
    const cal = calWindow.Cal ||= bootstrap;
    cal('init', 'mmbl-demo', { origin: 'https://app.cal.com' });
    cal.config = { ...cal.config, forwardQueryParams: true };
    const widget = cal.ns?.['mmbl-demo'];
    if (!widget) return this.fail();
    widget('inline', {
      elementOrSelector: '#mmbl-cal-inline', calLink: this.eventPath,
      config: { layout: 'month_view', useSlotsViewOnSmallScreen: 'true', theme: 'light' }
    });
    widget('ui', { theme: 'light', styles: { branding: { brandColor: '#16645e' } }, layout: 'month_view' });
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
