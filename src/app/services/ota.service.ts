import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { OtaIntegration, OtaBooking, OtaProvider } from '../interfaces/ota-integration';

export interface ApiResponse<T = any> {
  message?: string;
  data?: T;
  error?: any;
}

interface BookingComResponse {
  reservations: {
    id: string;
    guest: {
      firstName: string;
      lastName: string;
      email: string;
      telephone: string;
      nationality: string;
    };
    arrivalDate: string;
    departureDate: string;
    roomType: string;
    price: {
      total: number;
      currency: string;
      perNight: number;
    };
    status: string;
    numberOfAdults: number;
    numberOfChildren: number;
    specialRequests: string[];
    payment: {
      method: string;
      status: string;
      totalPaid: number;
    };
    commission: {
      amount: number;
    };
    roomId: string;
    ratePlanId: string;
    numberOfRooms: number;
    mealPlan: string;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class OtaService {
  private apiUrl = 'http://localhost:3000/ota-integrations';
  
  // OTA Provider Base URLs
  private readonly OTA_URLS = {
    'Booking.com': 'https://distribution-xml.booking.com/2.0',
    'Agoda': 'https://api.agoda.com/v2',
    'Traveloka': 'https://api.traveloka.com/v2',
    'Trip.com': 'https://api.trip.com/v2',
    'Expedia': 'https://api.ean.com/v3'
  };

  constructor(private http: HttpClient) { }

  private getHeaders(integration: OtaIntegration): HttpHeaders {
    let headers = new HttpHeaders()
      .set('Content-Type', 'application/json');
    
    switch (integration.provider) {
      case 'Booking.com':
        if (integration.credentials?.accessToken) {
          headers = headers.set('Authorization', `Bearer ${integration.credentials.accessToken}`);
        }
        break;
      
      case 'Agoda':
        if (integration.credentials?.agodaApiKey) {
          headers = headers.set('X-API-Key', integration.credentials.agodaApiKey);
        }
        break;
      
      case 'Traveloka':
        if (integration.credentials?.accessToken) {
          headers = headers.set('X-Client-ID', integration.credentials.travelokaClientId || '')
                         .set('Authorization', `Bearer ${integration.credentials.accessToken}`);
        }
        break;
      
      case 'Trip.com':
        if (integration.credentials?.tripClientId && integration.credentials?.tripClientSecret) {
          headers = headers.set('X-Partner-Id', integration.credentials.tripClientId)
                         .set('X-Partner-Secret', integration.credentials.tripClientSecret);
        }
        break;
      
      case 'Expedia':
        if (integration.credentials?.expediaApiKey) {
          headers = headers.set('Authorization', `EAN apikey=${integration.credentials.expediaApiKey}`);
        }
        break;
    }
    
    return headers;
  }

  // CRUD Operations
  getOtaIntegrations(hotelId?: string): Observable<OtaIntegration[]> {
    let params = new HttpParams();
    if (hotelId) {
      params = params.set('hotelId', hotelId);
    }
    return this.http.get<OtaIntegration[]>(this.apiUrl, { params });
  }

  getOtaIntegrationById(id: string): Observable<OtaIntegration> {
    return this.http.get<OtaIntegration>(`${this.apiUrl}/${id}`);
  }

  createOtaIntegration(integrationData: Partial<OtaIntegration>): Observable<ApiResponse<OtaIntegration>> {
    return this.http.post<ApiResponse<OtaIntegration>>(this.apiUrl, integrationData);
  }

  updateOtaIntegration(id: string, integrationData: Partial<OtaIntegration>): Observable<ApiResponse<OtaIntegration>> {
    return this.http.put<ApiResponse<OtaIntegration>>(`${this.apiUrl}/${id}`, integrationData);
  }

  deleteOtaIntegration(id: string): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${this.apiUrl}/${id}`);
  }

  // Authentication Methods
  loginOtaProvider(id: string, provider: OtaProvider, credentials: any): Observable<ApiResponse<OtaIntegration>> {
    return this.http.post<ApiResponse<OtaIntegration>>(`${this.apiUrl}/${id}/login`, { provider, credentials })
      .pipe(
        catchError(error => {
          console.error('Login error:', error);
          return throwError(() => error);
        })
      );
  }

  // Property Information Methods
  getPropertyInfo(integration: OtaIntegration): Observable<any> {
    const headers = this.getHeaders(integration);
    const baseUrl = this.OTA_URLS[integration.provider];
    let endpoint = '';

    switch (integration.provider) {
      case 'Booking.com':
        endpoint = `/hotels/${integration.credentials?.hotelId}`;
        break;
      case 'Agoda':
        endpoint = `/properties/${integration.credentials?.propertyId}`;
        break;
      case 'Traveloka':
        endpoint = `/properties/detail`;
        break;
      case 'Trip.com':
        endpoint = `/hotels/detail`;
        break;
      case 'Expedia':
        endpoint = `/properties/${integration.credentials?.expediaHotelId}`;
        break;
    }

    return this.http.get(`${baseUrl}${endpoint}`, { headers });
  }

  // Booking Methods
  getBookings(integration: OtaIntegration, params?: {
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Observable<OtaBooking[]> {
    const headers = this.getHeaders(integration);
    const baseUrl = this.OTA_URLS[integration.provider];
    let httpParams = new HttpParams();
    
    if (params?.startDate) httpParams = httpParams.set('startDate', params.startDate);
    if (params?.endDate) httpParams = httpParams.set('endDate', params.endDate);
    if (params?.status) httpParams = httpParams.set('status', params.status);

    return this.http.get<any>(`${baseUrl}/bookings`, { headers, params: httpParams })
      .pipe(
        map(response => this.mapBookingsToStandardFormat(response, integration.provider)),
        catchError(error => {
          console.error('Get bookings error:', error);
          return throwError(() => error);
        })
      );
  }

  // Inventory Management
  updateInventory(integration: OtaIntegration, data: {
    roomId: string;
    dateRange: { startDate: string; endDate: string };
    availability: number;
    price?: number;
  }): Observable<any> {
    const headers = this.getHeaders(integration);
    const baseUrl = this.OTA_URLS[integration.provider];
    
    return this.http.post(`${baseUrl}/inventory/update`, data, { headers })
      .pipe(
        catchError(error => {
          console.error('Update inventory error:', error);
          return throwError(() => error);
        })
      );
  }

  // Rate Management
  updateRates(integration: OtaIntegration, data: {
    roomId: string;
    ratePlanId: string;
    dateRange: { startDate: string; endDate: string };
    rates: { date: string; price: number }[];
  }): Observable<any> {
    const headers = this.getHeaders(integration);
    const baseUrl = this.OTA_URLS[integration.provider];
    
    return this.http.post(`${baseUrl}/rates/update`, data, { headers });
  }

  // Sync Operations
  syncOtaData(id: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.apiUrl}/${id}/sync`, {});
  }

  private mapBookingsToStandardFormat(response: any, provider: OtaProvider): OtaBooking[] {
    switch (provider) {
      case 'Booking.com':
        return this.mapBookingComBookings(response);
      case 'Agoda':
        return this.mapAgodaBookings(response);
      case 'Traveloka':
        return this.mapTravelokaBookings(response);
      case 'Trip.com':
        return this.mapTripBookings(response);
      case 'Expedia':
        return this.mapExpediaBookings(response);
      default:
        return [];
    }
  }

  private mapBookingComBookings(response: BookingComResponse): OtaBooking[] {
    return response.reservations.map(booking => ({
      otaBookingId: booking.id,
      otaProvider: 'Booking.com',
      guestName: `${booking.guest.firstName} ${booking.guest.lastName}`,
      checkInDate: new Date(booking.arrivalDate),
      checkOutDate: new Date(booking.departureDate),
      roomTypeName: booking.roomType,
      totalAmount: booking.price.total,
      currency: booking.price.currency,
      status: booking.status,
      source: 'Booking.com',
      numberOfGuests: {
        adults: booking.numberOfAdults,
        children: booking.numberOfChildren
      },
      guestDetails: {
        email: booking.guest.email,
        phone: booking.guest.telephone,
        nationality: booking.guest.nationality,
        specialRequests: booking.specialRequests
      },
      paymentDetails: {
        method: booking.payment.method,
        status: booking.payment.status,
        totalPaid: booking.payment.totalPaid,
        commission: booking.commission.amount,
        currency: booking.price.currency
      },
      roomDetails: [{
        roomTypeId: booking.roomId,
        ratePlanId: booking.ratePlanId,
        quantity: booking.numberOfRooms,
        pricePerNight: booking.price.perNight,
        mealPlan: booking.mealPlan
      }]
    }));
  }

  private mapAgodaBookings(response: any): OtaBooking[] {
    // Implement Agoda specific mapping
    return [];
  }

  private mapTravelokaBookings(response: any): OtaBooking[] {
    // Implement Traveloka specific mapping
    return [];
  }

  private mapTripBookings(response: any): OtaBooking[] {
    // Implement Trip.com specific mapping
    return [];
  }

  private mapExpediaBookings(response: any): OtaBooking[] {
    // Implement Expedia specific mapping
    return [];
  }
} 