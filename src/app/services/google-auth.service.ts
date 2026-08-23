import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, map, switchMap, take } from 'rxjs/operators';
import { environment } from '../../environments/environment';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
        oauth2: {
          initCodeClient: (config: Record<string, unknown>) => { requestCode: () => void };
        };
      };
    };
  }
}

export interface GoogleAuthConfig {
  enabled: boolean;
  clientId: string;
}

export interface GoogleSignInResult {
  idToken?: string;
  code?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GoogleAuthService {
  private scriptPromise?: Promise<void>;

  constructor(private http: HttpClient) {}

  getConfig(): Observable<GoogleAuthConfig> {
    return this.http.get<GoogleAuthConfig>(`${environment.apiUrl}/users/google/config`).pipe(
      map((config) => ({
        enabled: !!config?.enabled && !!config?.clientId,
        clientId: config?.clientId || environment.googleClientId || ''
      })),
      catchError(() =>
        of({
          enabled: !!environment.googleClientId,
          clientId: environment.googleClientId || ''
        })
      )
    );
  }

  signIn(): Observable<GoogleSignInResult> {
    return this.getConfig().pipe(
      take(1),
      switchMap((config) => {
        if (!config.enabled || !config.clientId) {
          return throwError(() => new Error('Google Sign-In chưa được cấu hình'));
        }
        return from(this.requestSignIn(config.clientId));
      })
    );
  }

  private loadScript(): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('Google Sign-In không khả dụng'));
    }
    if (window.google?.accounts) {
      return Promise.resolve();
    }
    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    this.scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Không tải được Google Sign-In'));
      document.head.appendChild(script);
    });

    return this.scriptPromise;
  }

  private async requestSignIn(clientId: string): Promise<GoogleSignInResult> {
    await this.loadScript();
    const google = window.google;
    if (!google?.accounts) {
      throw new Error('Google Sign-In chưa sẵn sàng');
    }

    try {
      const codeResult = await this.requestAuthCode(clientId);
      return { code: codeResult.code };
    } catch {
      return this.requestIdToken(clientId);
    }
  }

  private requestAuthCode(clientId: string): Promise<{ code: string }> {
    const google = window.google;
    if (!google?.accounts?.oauth2) {
      return Promise.reject(new Error('Google OAuth chưa sẵn sàng'));
    }

    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: 'openid email profile',
        ux_mode: 'popup',
        callback: (response: { code?: string; error?: string }) => {
          if (response?.code) {
            resolve({ code: response.code });
            return;
          }
          reject(new Error(response?.error || 'Đăng nhập Google bị hủy'));
        }
      });
      client.requestCode();
    });
  }

  private requestIdToken(clientId: string): Promise<GoogleSignInResult> {
    const google = window.google;
    if (!google?.accounts?.id) {
      return Promise.reject(new Error('Google Identity chưa sẵn sàng'));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const host = document.createElement('div');
      host.style.position = 'fixed';
      host.style.left = '-9999px';
      host.style.top = '-9999px';
      document.body.appendChild(host);

      const cleanup = () => {
        window.setTimeout(() => host.remove(), 500);
      };

      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          cleanup();
          if (settled) return;
          settled = true;
          if (response?.credential) {
            resolve({ idToken: response.credential });
            return;
          }
          reject(new Error('Không nhận được token Google'));
        }
      });

      google.accounts.id.renderButton(host, {
        type: 'standard',
        theme: 'outline',
        size: 'large'
      });

      window.setTimeout(() => {
        const btn = host.querySelector('[role="button"]') as HTMLElement | null;
        if (btn) {
          btn.click();
          return;
        }
        cleanup();
        if (!settled) {
          settled = true;
          reject(new Error('Không mở được cửa sổ đăng nhập Google'));
        }
      }, 100);
    });
  }
}
