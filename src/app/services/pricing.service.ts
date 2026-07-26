import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { finalize, shareReplay, tap } from 'rxjs/operators';

export interface PricingPackage {
  id?: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  features: string[];
  permissions: string[];
  maxUsers: number;
  maxRooms?: number;
  isContactOnly?: boolean;
  contactLabel?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactUrl?: string;
  isActive: boolean;
}

export interface PackageSubscriber {
  userId: string;
  username: string;
  email: string;
  packageId: string;
  packageName: string;
  expiryDate: Date;
}

interface CachedPayload<T> {
  payload: T;
  updatedAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class PricingService {
  private apiUrl = `${environment.apiUrl}/pricing-packages`;
  public subscriptionChanged$ = new Subject<void>();

  /** Memory cache — hiển thị tức thì khi quay lại /pricing */
  private packagesCache: CachedPayload<any> | null = null;
  private packagesInFlight$: Observable<any> | null = null;
  private currentPackageCache = new Map<string, CachedPayload<any>>();
  private currentPackageInFlight = new Map<string, Observable<any>>();

  constructor(private http: HttpClient) { }

  getCachedPackages(): CachedPayload<any> | null {
    return this.packagesCache;
  }

  setCachedPackages(payload: any): void {
    if (payload == null) {
      return;
    }
    this.packagesCache = {
      payload,
      updatedAt: Date.now()
    };
  }

  clearPackagesCache(): void {
    this.packagesCache = null;
    this.packagesInFlight$ = null;
  }

  getCachedCurrentUserPackage(userId: string): CachedPayload<any> | null {
    if (!userId) {
      return null;
    }
    return this.currentPackageCache.get(String(userId)) || null;
  }

  setCachedCurrentUserPackage(userId: string, payload: any): void {
    if (!userId) {
      return;
    }
    this.currentPackageCache.set(String(userId), {
      payload,
      updatedAt: Date.now()
    });
  }

  clearCurrentUserPackageCache(userId?: string): void {
    if (userId) {
      this.currentPackageCache.delete(String(userId));
      this.currentPackageInFlight.delete(String(userId));
      return;
    }
    this.currentPackageCache.clear();
    this.currentPackageInFlight.clear();
  }

  clearAllPricingCache(): void {
    this.clearPackagesCache();
    this.clearCurrentUserPackageCache();
  }

  /** Prefetch nền (login / app warm) để /pricing mở gần như tức thì. */
  prefetchPackages(): void {
    this.getAllPackages({ force: false }).subscribe({ next: () => {}, error: () => {} });
  }

  getAllPackages(options?: { force?: boolean }): Observable<any> {
    if (!options?.force && this.packagesInFlight$) {
      return this.packagesInFlight$;
    }

    this.packagesInFlight$ = this.http.get(this.apiUrl).pipe(
      tap((response: any) => {
        if (response && response.success !== false) {
          this.setCachedPackages(response);
        }
      }),
      finalize(() => {
        this.packagesInFlight$ = null;
      }),
      shareReplay(1)
    );

    return this.packagesInFlight$;
  }

  getPackageById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  createPackage(data: PricingPackage): Observable<any> {
    const payload = {
      ...data,
      features: data.features || [],
      permissions: data.permissions || ['view']
    };
    return this.http.post(this.apiUrl, payload).pipe(
      tap(() => this.clearPackagesCache())
    );
  }

  updatePackage(id: string, data: Partial<PricingPackage>): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data).pipe(
      tap(() => this.clearPackagesCache())
    );
  }

  deletePackage(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`).pipe(
      tap(() => this.clearPackagesCache())
    );
  }

  getAvailablePermissions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/permissions`);
  }

  getAllSubscribers(): Observable<any> {
    return this.http.get(`${this.apiUrl}/subscribers/all`);
  }

  subscribe(userId: string, packageId: string, billingType: 'monthly' | 'yearly' = 'monthly', paymentId?: string, paymentMethod?: string): Observable<any> {
    const payload: any = { userId, packageId, billingType };
    if (paymentId) {
      payload.paymentId = paymentId;
      payload.paymentMethod = paymentMethod || 'paypal';
    }
    return this.http.post(`${this.apiUrl}/subscribe`, payload).pipe(
      tap(() => {
        this.clearCurrentUserPackageCache(userId);
        this.subscriptionChanged$.next();
      })
    );
  }

  cancelSubscription(userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/cancel`, { userId }).pipe(
      tap(() => {
        this.clearCurrentUserPackageCache(userId);
        this.subscriptionChanged$.next();
      })
    );
  }

  getCurrentUserPackage(userId: string, options?: { force?: boolean }): Observable<any> {
    if (!userId) {
      return of({ success: true, data: null });
    }

    const key = String(userId);
    if (!options?.force) {
      const inFlight = this.currentPackageInFlight.get(key);
      if (inFlight) {
        return inFlight;
      }
    }

    const request$ = this.http.get<any>(`${this.apiUrl}/user/${userId}`).pipe(
      tap((response) => {
        if (response && response.success !== false) {
          this.setCachedCurrentUserPackage(key, response);
        }
      }),
      finalize(() => {
        this.currentPackageInFlight.delete(key);
      }),
      shareReplay(1)
    );

    this.currentPackageInFlight.set(key, request$);
    return request$;
  }

  sendPaymentReminder(userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/send-payment-reminder`, { userId });
  }
}
