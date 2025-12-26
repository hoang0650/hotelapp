import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Announcement {
  id: string;
  type: 'maintenance' | 'update' | 'info' | 'warning' | 'success';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  startDate: Date | string;
  endDate?: Date | string;
  isActive: boolean;
  targetRoles?: string[];
  targetBusinesses?: string[]; // Array of business IDs
  targetHotels?: string[]; // Array of hotel IDs
  targetType?: 'system' | 'business' | 'hotel'; // Type of target
  createdAt: Date | string;
  createdBy?: string;
}

export interface NotificationResponse {
  success: boolean;
  message?: string;
  data: Announcement[];
}

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {
  private apiUrl = `${environment.apiUrl}/api/settings`;
  private announcementsSubject = new BehaviorSubject<Announcement[]>([]);
  public announcements$ = this.announcementsSubject.asObservable();
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadAnnouncements();
  }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    });
  }

  // Lấy tất cả announcements
  loadAnnouncements(): void {
    this.getAnnouncements().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.announcementsSubject.next(response.data);
          this.updateUnreadCount();
        }
      },
      error: (error) => {
        console.error('Error loading announcements:', error);
      }
    });
  }

  getAnnouncements(): Observable<NotificationResponse> {
    return this.http.get<NotificationResponse>(`${this.apiUrl}/announcements`, { 
      headers: this.getHeaders() 
    });
  }

  // Tạo announcement mới (chỉ admin)
  createAnnouncement(announcement: Partial<Announcement>): Observable<any> {
    return this.http.post(`${this.apiUrl}/announcements`, announcement, { 
      headers: this.getHeaders() 
    });
  }

  // Cập nhật announcement (chỉ admin)
  updateAnnouncement(id: string, announcement: Partial<Announcement>): Observable<any> {
    return this.http.put(`${this.apiUrl}/announcements/${id}`, announcement, { 
      headers: this.getHeaders() 
    });
  }

  // Xóa announcement (chỉ admin)
  deleteAnnouncement(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/announcements/${id}`, { 
      headers: this.getHeaders() 
    });
  }

  // Lấy số lượng thông báo chưa đọc
  getUnreadCount(): number {
    const announcements = this.announcementsSubject.value;
    const readAnnouncements = this.getReadAnnouncements();
    return announcements.filter(a => !readAnnouncements.includes(a.id)).length;
  }

  // Đánh dấu đã đọc
  markAsRead(announcementId: string): void {
    const readAnnouncements = this.getReadAnnouncements();
    if (!readAnnouncements.includes(announcementId)) {
      readAnnouncements.push(announcementId);
      localStorage.setItem('readAnnouncements', JSON.stringify(readAnnouncements));
      this.updateUnreadCount();
    }
  }

  // Đánh dấu tất cả đã đọc
  markAllAsRead(): void {
    const announcements = this.announcementsSubject.value;
    const readAnnouncements = announcements.map(a => a.id);
    localStorage.setItem('readAnnouncements', JSON.stringify(readAnnouncements));
    this.updateUnreadCount();
  }

  private getReadAnnouncements(): string[] {
    const stored = localStorage.getItem('readAnnouncements');
    return stored ? JSON.parse(stored) : [];
  }

  private updateUnreadCount(): void {
    const count = this.getUnreadCount();
    this.unreadCountSubject.next(count);
  }

  // Lấy thông báo maintenance mode từ settings
  getMaintenanceNotification(): Announcement | null {
    const maintenanceMode = localStorage.getItem('maintenanceMode') === 'true';
    const maintenanceMessage = localStorage.getItem('maintenanceMessage');
    
    if (maintenanceMode && maintenanceMessage) {
      return {
        id: 'maintenance-mode',
        type: 'maintenance',
        title: 'Hệ thống đang bảo trì',
        message: maintenanceMessage,
        priority: 'urgent',
        startDate: new Date(),
        isActive: true,
        createdAt: new Date()
      };
    }
    
    return null;
  }

  // Lấy tất cả thông báo (bao gồm maintenance)
  getAllNotifications(): Announcement[] {
    const announcements = this.announcementsSubject.value;
    const maintenanceNotification = this.getMaintenanceNotification();
    
    if (maintenanceNotification) {
      return [maintenanceNotification, ...announcements];
    }
    
    return announcements;
  }
}

