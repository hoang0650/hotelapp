import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { HotelService } from './hotel.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PaymentSpeakerService {
  private currentAudio: HTMLAudioElement | null = null;
  private enabledByHotelId = new Map<string, boolean>();
  private lastPlayedEventKey: string | null = null;
  private lastPlayedAt = 0;
  private readonly ttsBaseUrl = String(environment.aiUrl || 'https://ai.phhotel.vn').replace(/\/$/, '');

  constructor(
    private http: HttpClient,
    private hotelService: HotelService
  ) {}

  setEnabled(hotelId: string | null | undefined, enabled: boolean): void {
    const id = String(hotelId || '').trim();
    if (!id) return;
    this.enabledByHotelId.set(id, !!enabled);
  }

  isEnabled(hotelId: string | null | undefined): boolean {
    const id = String(hotelId || '').trim();
    if (!id) return false;
    return !!this.enabledByHotelId.get(id);
  }

  loadEnabled(hotelId: string | null | undefined): void {
    const id = String(hotelId || '').trim();
    if (!id) return;

    this.hotelService.getHotelById(id, { lite: true }).subscribe({
      next: (hotel) => {
        const enabled = !!hotel?.settings?.notificationSettings?.enablePaymentSpeaker;
        this.enabledByHotelId.set(id, enabled);
      },
      error: (error) => {
        console.error('[PaymentSpeakerService] Lỗi tải cài đặt loa:', error);
        this.enabledByHotelId.set(id, false);
      }
    });
  }

  tryPlayForPayment(
    payload: any,
    hotelId: string | null | undefined
  ): { matched: boolean; played: boolean } {
    const targetHotelId = String(hotelId || '').trim();
    const eventHotelId = String(payload?.hotelId || '').trim();
    if (!targetHotelId || !eventHotelId || targetHotelId !== eventHotelId) {
      return { matched: false, played: false };
    }

    const amount = Number(payload?.amount || 0);
    if (!this.isEnabled(targetHotelId) || amount <= 0) {
      return { matched: true, played: false };
    }

    const eventKey = String(
      payload?.paymentHistoryId ||
      payload?.transactionId ||
      payload?.id ||
      `${eventHotelId}_${amount}_${payload?.roomId || ''}`
    );

    const now = Date.now();
    if (eventKey && this.lastPlayedEventKey === eventKey && now - this.lastPlayedAt < 15000) {
      return { matched: true, played: false };
    }

    this.lastPlayedEventKey = eventKey;
    this.lastPlayedAt = now;
    this.playPaymentSuccess(amount);
    return { matched: true, played: true };
  }

  playPaymentSuccess(amount: number): void {
    const normalizedAmount = Math.round(Number(amount) || 0);
    if (normalizedAmount <= 0) {
      return;
    }

    const formattedAmount = normalizedAmount.toLocaleString('vi-VN');
    const message = `Thanh toán thành công số tiền ${formattedAmount} đồng`;
    this.speakMessage(message, { allowFallback: true }).subscribe({
      error: (error) => console.error('[PaymentSpeakerService] Lỗi phát loa thanh toán:', error)
    });
  }

  /** Test loa qua PHGroup-AI Edge TTS (`/tts`). */
  testSpeakViaAiTts(message: string): Observable<void> {
    const text = String(message || '').trim();
    if (!text) {
      return throwError(() => new Error('Nội dung thông báo trống'));
    }
    return this.speakMessage(text, { allowFallback: false });
  }

  private speakMessage(
    message: string,
    options: { allowFallback: boolean }
  ): Observable<void> {
    const ttsUrl =
      `${this.ttsBaseUrl}/tts` +
      `?text=${encodeURIComponent(message)}` +
      `&voice=${encodeURIComponent('vi-VN-HoaiMyNeural')}`;

    return this.http.get(ttsUrl, { responseType: 'blob' }).pipe(
      map((audioBlob: Blob) => {
        if (!audioBlob || audioBlob.size === 0) {
          throw new Error('TTS trả về file rỗng');
        }
        if (audioBlob.type && audioBlob.type.includes('application/json')) {
          throw new Error('TTS API trả về JSON lỗi thay vì audio');
        }
        this.playBlob(audioBlob, options.allowFallback ? message : '');
        return undefined as void;
      }),
      catchError((error) => {
        console.error('[PaymentSpeakerService] Lỗi gọi AI TTS:', error);
        if (options.allowFallback) {
          this.speakFallback(message);
          return of(undefined as void);
        }
        const detail =
          error?.error?.error ||
          error?.message ||
          `Không gọi được AI TTS (${this.ttsBaseUrl}/tts)`;
        return throwError(() => (error?.status ? error : new Error(String(detail))));
      })
    );
  }

  private speakFallback(message: string): void {
    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(message);
      utter.lang = 'vi-VN';
      utter.rate = 1;
      window.speechSynthesis.speak(utter);
    } catch (error) {
      console.error('[PaymentSpeakerService] Fallback speechSynthesis lỗi:', error);
    }
  }

  private playBlob(audioBlob: Blob, fallbackMessage: string): void {
    const audioUrl = URL.createObjectURL(audioBlob);

    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
      } catch (_error) {}
    }

    const audio = new Audio(audioUrl);
    this.currentAudio = audio;

    const cleanup = () => {
      URL.revokeObjectURL(audioUrl);
      if (this.currentAudio === audio) {
        this.currentAudio = null;
      }
    };

    audio.onended = cleanup;
    audio.onerror = () => {
      cleanup();
      if (fallbackMessage) {
        this.speakFallback(fallbackMessage);
      }
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.error('[PaymentSpeakerService] Trình duyệt chặn autoplay audio:', error);
        cleanup();
        if (fallbackMessage) {
          this.speakFallback(fallbackMessage);
        }
      });
    }
  }
}
