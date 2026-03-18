import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { GuestInfo, OrderedService } from '../interfaces/rooms';
import { ApiService } from './api.service';

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
  advancePaymentMethod?: 'cash' | 'bank' | 'credit_card' | string;
  discount?: number;
  notes?: string;
  selectedServices: OrderedService[];
}

@Injectable({
  providedIn: 'root'
})
export class RoomSessionService {
  private activeSessionsMap: Map<string, BehaviorSubject<RoomSession | null>> = new Map();
  private hotelId: string = '';

  constructor(private apiService: ApiService) {
    this.loadFromStorage();
    window.addEventListener('beforeunload', () => {
      this.saveToStorage();
    });
  }

  setHotelId(hotelId: string): void {
    this.hotelId = hotelId;
  }

  private getHotelId(): string {
    return this.hotelId || localStorage.getItem('selectedHotelId') || '';
  }

  startSession(roomId: string, sessionData: RoomSession): void {
    if (!this.activeSessionsMap.has(roomId)) {
      this.activeSessionsMap.set(roomId, new BehaviorSubject<RoomSession | null>(null));
    }
    this.activeSessionsMap.get(roomId)?.next(sessionData);
    console.log(`Room session started for room ${roomId}:`, sessionData);
    this.saveToStorage();
  }

  updateSession(roomId: string, sessionData: Partial<RoomSession>): void {
    const currentSession = this.activeSessionsMap.get(roomId)?.getValue();
    if (currentSession) {
      const updatedSession = {...currentSession, ...sessionData};
      this.activeSessionsMap.get(roomId)?.next(updatedSession);
      console.log(`Room session updated for room ${roomId}:`, updatedSession);
      this.saveToStorage();
    } else {
      console.warn(`Attempted to update non-existent session for room ${roomId}`);
    }
  }

  addService(roomId: string, service: OrderedService): void {
    const currentSession = this.activeSessionsMap.get(roomId)?.getValue();
    if (currentSession) {
      const existingIndex = currentSession.selectedServices.findIndex(
        s => s.serviceId === service.serviceId
      );

      if (existingIndex >= 0) {
        const updatedServices = [...currentSession.selectedServices];
        updatedServices[existingIndex].quantity += service.quantity;
        updatedServices[existingIndex].totalPrice =
          updatedServices[existingIndex].quantity * updatedServices[existingIndex].price;
        this.updateSession(roomId, { selectedServices: updatedServices });
      } else {
        this.updateSession(roomId, {
          selectedServices: [...currentSession.selectedServices, service]
        });
      }
    }
  }

  removeService(roomId: string, index: number): void {
    const currentSession = this.activeSessionsMap.get(roomId)?.getValue();
    if (currentSession && currentSession.selectedServices.length > index) {
      const updatedServices = [...currentSession.selectedServices];
      updatedServices.splice(index, 1);
      this.updateSession(roomId, { selectedServices: updatedServices });
    }
  }

  getSession(roomId: string): RoomSession | null {
    return this.activeSessionsMap.get(roomId)?.getValue() || null;
  }

  getSessionObservable(roomId: string): Observable<RoomSession | null> {
    if (!this.activeSessionsMap.has(roomId)) {
      this.activeSessionsMap.set(roomId, new BehaviorSubject<RoomSession | null>(null));
    }
    return this.activeSessionsMap.get(roomId)!.asObservable();
  }

  endSession(roomId: string): RoomSession | null {
    const session = this.getSession(roomId);
    if (session) {
      const finalSession = {...session};
      this.activeSessionsMap.get(roomId)?.next(null);
      console.log(`Room session ended for room ${roomId}`);
      this.saveToStorage();
      return finalSession;
    }
    return null;
  }

  private saveToStorage(): void {
    const storageData: Record<string, RoomSession | null> = {};
    this.activeSessionsMap.forEach((subject, roomId) => {
      const session = subject.getValue();
      if (session) {
        storageData[roomId] = session;
      }
    });

    const hotelId = this.getHotelId();
    if (hotelId) {
      this.apiService.saveRoomSessions(hotelId, storageData).subscribe({
        next: () => console.log('[Redis] Room sessions saved'),
        error: (err) => console.error('[Redis] Error saving room sessions:', err)
      });
    }
    localStorage.setItem('roomSessions', JSON.stringify(storageData));
  }

  private loadFromStorage(): void {
    const storageData = localStorage.getItem('roomSessions');
    if (storageData) {
      try {
        const sessions: Record<string, RoomSession> = JSON.parse(storageData);
        Object.entries(sessions).forEach(([roomId, session]) => {
          if (session.checkinTime) {
            session.checkinTime = new Date(session.checkinTime);
          }
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

    const hotelId = this.getHotelId();
    if (hotelId) {
      this.apiService.getRoomSessions(hotelId).subscribe({
        next: (sessions) => {
          if (sessions && Object.keys(sessions).length > 0) {
            Object.entries(sessions).forEach(([roomId, session]: [string, any]) => {
              if (session.checkinTime) {
                session.checkinTime = new Date(session.checkinTime);
              }
              if (!this.activeSessionsMap.has(roomId)) {
                this.activeSessionsMap.set(roomId, new BehaviorSubject<RoomSession | null>(null));
              }
              this.activeSessionsMap.get(roomId)?.next(session);
            });
            console.log('[Redis] Room sessions loaded from Redis:', sessions);
          }
        },
        error: (err) => console.error('[Redis] Error loading room sessions:', err)
      });
    }
  }

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

  clearAllSessions(): void {
    this.activeSessionsMap.forEach((subject) => {
      subject.next(null);
    });
    localStorage.removeItem('roomSessions');
    console.log('All room sessions cleared');
  }
}