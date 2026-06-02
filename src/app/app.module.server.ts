import { NgModule } from '@angular/core';
import { ServerModule } from '@angular/platform-server';
import { TranslateLoader } from '@ngx-translate/core';
import { from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { AppModule } from './app.module';
import { AppComponent } from './app.component';

class ServerTranslateLoader implements TranslateLoader {
  getTranslation(lang: string) {
    const safeLang = String(lang || 'vi').replace(/[^a-zA-Z_-]/g, '');
    return from(
      Promise.all([import('node:fs/promises'), import('node:path')]).then(async ([fs, path]) => {
        const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
        const candidates = [
          path.join(baseDir, '..', 'browser', 'assets', 'i18n', `${safeLang}.json`),
          path.join(process.cwd(), '..', 'browser', 'assets', 'i18n', `${safeLang}.json`),
          path.join(process.cwd(), 'browser', 'assets', 'i18n', `${safeLang}.json`),
          path.join(process.cwd(), 'dist', 'hotel', 'browser', 'assets', 'i18n', `${safeLang}.json`),
          path.join(process.cwd(), 'dist', 'browser', 'assets', 'i18n', `${safeLang}.json`),
          path.join(process.cwd(), 'src', 'assets', 'i18n', `${safeLang}.json`),
          path.join(process.cwd(), 'assets', 'i18n', `${safeLang}.json`),
        ];

        for (const filePath of candidates) {
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
          } catch {
          }
        }

        return {};
      })
    ).pipe(
      catchError(() => of({})),
      map((v: any) => (v && typeof v === 'object' ? v : {}))
    );
  }
}

@NgModule({
  imports: [
    AppModule,
    ServerModule,
  ],
  providers: [{ provide: TranslateLoader, useClass: ServerTranslateLoader }],
  bootstrap: [AppComponent],
})
export class AppServerModule {}
