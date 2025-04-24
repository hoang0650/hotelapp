import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { GuestInfo, OrderedService } from '../interfaces/rooms';

export interface RoomSession {
  roomId: string;
  roomNumber: number;
  roomType: string;
  hotelId: string;
  checkinTime: Date;
  guestInfo?: GuestInfo;
  paymentMethod?: string;
  rateType?: 'hourly' | 'daily' | 'nightly';
  advancePayment?: number;
  additionalCharges?: number;
  discount?: number;
  notes?: string;
  selectedServices: OrderedService[];
}

@Injectable({
  providedIn: 'root'
})
export class RoomSessionService {
  private activeSessionsMap: Map<string, BehaviorSubject<RoomSession | null>> = new Map();
  
  constructor() {
    // Khôi phục dữ liệu từ localStorage nếu có
    this.loadFromStorage();
    
    // Lắng nghe sự kiện đóng browser để lưu dữ liệu
    window.addEventListener('beforeunload', () => {
      this.saveToStorage();
    });
  }
  
  // Lưu phiên khi check-in
  startSession(roomId: string, sessionData: RoomSession): void {
    // Nếu chưa có BehaviorSubject cho phòng này, tạo mới
    if (!this.activeSessionsMap.has(roomId)) {
      this.activeSessionsMap.set(roomId, new BehaviorSubject<RoomSession | null>(null));
    }
    
    // Cập nhật dữ liệu
    this.activeSessionsMap.get(roomId)?.next(sessionData);
    console.log(`Room session started for room ${roomId}:`, sessionData);
    
    // Lưu vào localStorage
    this.saveToStorage();
  }
  
  // Cập nhật phiên
  updateSession(roomId: string, sessionData: Partial<RoomSession>): void {
    const currentSession = this.activeSessionsMap.get(roomId)?.getValue();
    if (currentSession) {
      const updatedSession = {...currentSession, ...sessionData};
      this.activeSessionsMap.get(roomId)?.next(updatedSession);
      console.log(`Room session updated for room ${roomId}:`, updatedSession);
      
      // Lưu vào localStorage
      this.saveToStorage();
    } else {
      console.warn(`Attempted to update non-existent session for room ${roomId}`);
    }
  }
  
  // Thêm dịch vụ vào phiên
  addService(roomId: string, service: OrderedService): void {
    const currentSession = this.activeSessionsMap.get(roomId)?.getValue();
    if (currentSession) {
      // Kiểm tra xem dịch vụ đã tồn tại chưa
      const existingIndex = currentSession.selectedServices.findIndex(
        s => s.serviceId === service.serviceId
      );
      
      if (existingIndex >= 0) {
        // Cập nhật số lượng nếu dịch vụ đã tồn tại
        const updatedServices = [...currentSession.selectedServices];
        updatedServices[existingIndex].quantity += service.quantity;
        updatedServices[existingIndex].totalPrice = 
          updatedServices[existingIndex].quantity * updatedServices[existingIndex].price;
        
        this.updateSession(roomId, { selectedServices: updatedServices });
      } else {
        // Thêm dịch vụ mới
        this.updateSession(roomId, { 
          selectedServices: [...currentSession.selectedServices, service] 
        });
      }
    }
  }
  
  // Xóa dịch vụ khỏi phiên
  removeService(roomId: string, index: number): void {
    const currentSession = this.activeSessionsMap.get(roomId)?.getValue();
    if (currentSession && currentSession.selectedServices.length > index) {
      const updatedServices = [...currentSession.selectedServices];
      updatedServices.splice(index, 1);
      this.updateSession(roomId, { selectedServices: updatedServices });
    }
  }
  
  // Lấy thông tin phiên hiện tại
  getSession(roomId: string): RoomSession | null {
    return this.activeSessionsMap.get(roomId)?.getValue() || null;
  }
  
  // Lắng nghe thay đổi phiên
  getSessionObservable(roomId: string): Observable<RoomSession | null> {
    if (!this.activeSessionsMap.has(roomId)) {
      this.activeSessionsMap.set(roomId, new BehaviorSubject<RoomSession | null>(null));
    }
    return this.activeSessionsMap.get(roomId)!.asObservable();
  }
  
  // Kết thúc phiên khi check-out
  endSession(roomId: string): RoomSession | null {
    const session = this.getSession(roomId);
    if (session) {
      // Lưu lại session cuối cùng trước khi kết thúc
      const finalSession = {...session};
      
      // Xóa session
      this.activeSessionsMap.get(roomId)?.next(null);
      console.log(`Room session ended for room ${roomId}`);
      
      // Lưu vào localStorage
      this.saveToStorage();
      
      return finalSession;
    }
    return null;
  }
  
  // Lưu tất cả phiên vào localStorage
  private saveToStorage(): void {
    const storageData: Record<string, RoomSession | null> = {};
    
    this.activeSessionsMap.forEach((subject, roomId) => {
      const session = subject.getValue();
      if (session) {
        storageData[roomId] = session;
      }
    });
    
    localStorage.setItem('roomSessions', JSON.stringify(storageData));
  }
  
  // Khôi phục phiên từ localStorage
  private loadFromStorage(): void {
    const storageData = localStorage.getItem('roomSessions');
    if (storageData) {
      try {
        const sessions: Record<string, RoomSession> = JSON.parse(storageData);
        
        Object.entries(sessions).forEach(([roomId, session]) => {
          // Chuyển đổi chuỗi thành Date object
          if (session.checkinTime) {
            session.checkinTime = new Date(session.checkinTime);
          }
          
          // Khởi tạo BehaviorSubject và lưu session
          if (!this.activeSessionsMap.has(roomId)) {
            this.activeSessionsMap.set(roomId, new BehaviorSubject<RoomSession | null>(null));
          }
          this.activeSessionsMap.get(roomId)?.next(session);
        });
        
        console.log('Room sessions loaded from storage:', sessions);
      } catch (error) {
        console.error('Error loading room sessions from storage:', error);
      }
    }
  }
  
  // Lấy danh sách tất cả các phiên đang hoạt động
  getAllActiveSessions(): Array<{roomId: string, session: RoomSession}> {
    const result: Array<{roomId: string, session: RoomSession}> = [];
    
    this.activeSessionsMap.forEach((subject, roomId) => {
      const session = subject.getValue();
      if (session) {
        result.push({roomId, session});
      }
    });
    
    return result;
  }
  
  // Xóa tất cả phiên
  clearAllSessions(): void {
    this.activeSessionsMap.forEach((subject) => {
      subject.next(null);
    });
    localStorage.removeItem('roomSessions');
    console.log('All room sessions cleared');
  }
} 