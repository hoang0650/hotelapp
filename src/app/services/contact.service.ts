import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Contact {
  _id?: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  status?: 'pending' | 'read' | 'replied' | 'archived';
  repliedAt?: Date;
  repliedBy?: {
    _id: string;
    username: string;
    email: string;
    fullName: string;
  };
  replyMessage?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ContactQuery {
  page?: number;
  limit?: number;
  status?: 'pending' | 'read' | 'replied' | 'archived';
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface ContactResponse {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ContactStats {
  total: number;
  pending: number;
  read: number;
  replied: number;
  archived: number;
}

@Injectable({
  providedIn: 'root'
})
export class ContactService {
  private apiUrl = `${environment.apiUrl || 'https://nest-production-8106.up.railway.app'}/contacts`;

  constructor(private http: HttpClient) { }

  // Public method - không cần authentication
  createContact(contact: {
    name: string;
    email: string;
    phone?: string;
    subject: string;
    message: string;
  }): Observable<{ message: string; contact: Contact }> {
    return this.http.post<{ message: string; contact: Contact }>(this.apiUrl, contact);
  }

  // Protected methods - cần authentication (admin/superadmin)
  getContacts(query?: ContactQuery): Observable<ContactResponse> {
    let params = new HttpParams();
    
    if (query?.page) {
      params = params.set('page', query.page.toString());
    }
    
    if (query?.limit) {
      params = params.set('limit', query.limit.toString());
    }
    
    if (query?.status) {
      params = params.set('status', query.status);
    }
    
    if (query?.search) {
      params = params.set('search', query.search);
    }
    
    if (query?.startDate) {
      params = params.set('startDate', query.startDate);
    }
    
    if (query?.endDate) {
      params = params.set('endDate', query.endDate);
    }

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
    });

    return this.http.get<ContactResponse>(this.apiUrl, { params, headers });
  }

  getContactById(id: string): Observable<{ contact: Contact }> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
    });

    return this.http.get<{ contact: Contact }>(`${this.apiUrl}/${id}`, { headers });
  }

  updateContactStatus(id: string, status: string, notes?: string): Observable<{ message: string; contact: Contact }> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
    });

    return this.http.patch<{ message: string; contact: Contact }>(
      `${this.apiUrl}/${id}/status`,
      { status, notes },
      { headers }
    );
  }

  replyContact(id: string, replyMessage: string): Observable<{ message: string; contact: Contact }> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
    });

    return this.http.post<{ message: string; contact: Contact }>(
      `${this.apiUrl}/${id}/reply`,
      { replyMessage },
      { headers }
    );
  }

  deleteContact(id: string): Observable<{ message: string }> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
    });

    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`, { headers });
  }

  getContactStats(): Observable<{ stats: ContactStats }> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
    });

    return this.http.get<{ stats: ContactStats }>(`${this.apiUrl}/stats`, { headers });
  }
}

