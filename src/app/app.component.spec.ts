import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { Link } from './links-api.service';

describe('AppComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function createFixture() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/links').flush([]);
    fixture.detectChanges();
    return fixture;
  }

  function submitUrl(fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>, url: string) {
    fixture.componentInstance.urlControl.setValue(url);
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('rejects non-HTTP URLs before making an API request', () => {
    const fixture = createFixture();

    submitUrl(fixture, 'ftp://example.com/file');

    expect(fixture.componentInstance.urlControl.invalid).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Enter a valid URL');
    http.expectNone('http://localhost:3000/api/links');
  });

  it('creates a short link, refreshes the table, and prevents duplicate submission while pending', () => {
    const fixture = createFixture();
    const link: Link = {
      code: 'a1B2c3',
      url: 'https://example.com/a/long/path',
      shortUrl: 'http://localhost:3000/a1B2c3',
      hits: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    submitUrl(fixture, link.url);

    const post = http.expectOne('http://localhost:3000/api/links');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ url: link.url });
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBeTrue();
    post.flush(link);

    http.expectOne('http://localhost:3000/api/links').flush([link]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.notice-success a').getAttribute('href')).toBe(link.shortUrl);
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain(link.url);
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('0');
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBeFalse();
  });

  it('shows backend validation errors inline', () => {
    const fixture = createFixture();

    submitUrl(fixture, 'https://example.com');
    http
      .expectOne('http://localhost:3000/api/links')
      .flush({ error: 'URL is not allowed' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.notice-error').textContent).toContain('URL is not allowed');
  });
});
