import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { tap } from 'rxjs/operators';

export interface PricingPackage {
  id?: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  features: string[];
  permissions: string[];
  maxUsers: number;
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

@Injectable({
  providedIn: 'root'
})
export class PricingService {
  private apiUrl = `${environment.apiUrl}/pricing-packages`;
  public subscriptionChanged$ = new Subject<void>();

  constructor(private http: HttpClient) { }

  getAllPackages(): Observable<any> {
    return this.http.get(this.apiUrl);
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
    return this.http.post(this.apiUrl, payload);
  }

  updatePackage(id: string, data: Partial<PricingPackage>): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }

  deletePackage(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getAvailablePermissions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/permissions`);
  }

  getAllSubscribers(): Observable<any> {
    return this.http.get(`${this.apiUrl}/subscribers/all`);
  }

  subscribe(userId: string, packageId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/subscribe`, { userId, packageId }).pipe(
      tap(() => this.subscriptionChanged$.next())
    );
  }

  cancelSubscription(userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/cancel`, { userId });
  }

  getCurrentUserPackage(userId: string): Observable<PricingPackage> {
    return this.http.get<PricingPackage>(`${this.apiUrl}/user/${userId}`);
  }
} 