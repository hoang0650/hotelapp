import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

// Ép HTTPS cho admin production (tránh badge "Không bảo mật" do HTTP)
if (typeof window !== 'undefined') {
  const host = window.location.hostname;
  if (
    window.location.protocol === 'http:' &&
    (host === 'admin.phhotel.vn' || host === 'phhotel.vn' || host === 'www.phhotel.vn')
  ) {
    const httpsUrl =
      'https://' + host + window.location.pathname + window.location.search + window.location.hash;
    window.location.replace(httpsUrl);
  }
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
