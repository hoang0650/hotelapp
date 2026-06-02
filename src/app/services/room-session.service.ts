import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
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
  totalPrice?: number;
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
  private loadSubscription?: Subscription;
  private pendingSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingSyncData = new Map<string, RoomSession | null>();
  private syncDebounceMs = 300;

  constructor(private apiService: ApiService) {
  }

  setHotelId(hotelId: string): void {
    if (!hotelId) return;
    if (this.hotelId === hotelId) return;
    this.loadSubscription?.unsubscribe();
    this.pendingSyncTimers.forEach((t) => clearTimeout(t));
    this.pendingSyncTimers.clear();
    this.pendingSyncData.clear();
    this.activeSessionsMap.clear();
    this.hotelId = hotelId;
    this.loadFromRedis();
  }

  private getHotelId(): string {
    return this.hotelId || '';
  }

  startSession(roomId: string, sessionData: RoomSession): void {
    if (!this.activeSessionsMap.has(roomId)) {
      this.activeSessionsMap.set(roomId, new BehaviorSubject<RoomSession | null>(null));
    }
    this.activeSessionsMap.get(roomId)?.next(sessionData);
    console.log(`Room session started for room ${roomId}:`, sessionData);
    this.scheduleRoomSync(roomId, sessionData);
  }

  updateSession(roomId: string, sessionData: Partial<RoomSession>): void {
    const currentSession = this.activeSessionsMap.get(roomId)?.getValue();
    if (currentSession) {
      const updatedSession = {...currentSession, ...sessionData};
      this.activeSessionsMap.get(roomId)?.next(updatedSession);
      console.log(`Room session updated for room ${roomId}:`, updatedSession);
      this.scheduleRoomSync(roomId, updatedSession);
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
      this.scheduleRoomSync(roomId, null);
      return finalSession;
    }
    return null;
  }

  private scheduleRoomSync(roomId: string, sessionData: RoomSession | null): void {
    const hotelId = this.getHotelId();
    if (!hotelId) return;

    const existingTimer = this.pendingSyncTimers.get(roomId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.pendingSyncTimers.delete(roomId);
    }

    this.pendingSyncData.set(roomId, sessionData);

    if (sessionData === null) {
      this.pendingSyncData.delete(roomId);
      this.apiService.updateRoomSession(hotelId, roomId, null).subscribe({
        next: () => console.log('[Redis] Room session updated'),
        error: (err) => console.error('[Redis] Error updating room session:', err)
      });
      return;
    }

    const timer = setTimeout(() => {
      this.pendingSyncTimers.delete(roomId);
      const data = this.pendingSyncData.get(roomId);
      this.pendingSyncData.delete(roomId);

      if (data === undefined) return;
      this.apiService.updateRoomSession(hotelId, roomId, data).subscribe({
        next: () => console.log('[Redis] Room session updated'),
        error: (err) => console.error('[Redis] Error updating room session:', err)
      });
    }, this.syncDebounceMs);

    this.pendingSyncTimers.set(roomId, timer);
  }

  private loadFromRedis(): void {
    const hotelId = this.getHotelId();
    if (hotelId) {
      this.loadSubscription?.unsubscribe();
      this.loadSubscription = this.apiService.getRoomSessions(hotelId).subscribe({
        next: (sessions) => {
          const roomsFromRedis = new Set<string>();
          if (sessions && Object.keys(sessions).length > 0) {
            Object.entries(sessions).forEach(([roomId, session]: [string, any]) => {
              roomsFromRedis.add(roomId);
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

          this.activeSessionsMap.forEach((subject, roomId) => {
            if (!roomsFromRedis.has(roomId)) {
              subject.next(null);
            }
          });
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
    console.log('All room sessions cleared');
    const hotelId = this.getHotelId();
    if (hotelId) {
      this.apiService.saveRoomSessions(hotelId, {}).subscribe({
        next: () => console.log('[Redis] Room sessions cleared'),
        error: (err) => console.error('[Redis] Error clearing room sessions:', err)
      });
    }
  }
}
