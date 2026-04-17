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
        const filePath = path.join(process.cwd(), 'src', 'assets', 'i18n', `${safeLang}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
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
