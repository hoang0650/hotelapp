import { Injectable } from '@angular/core';
import { SePayService } from './sepay.service';
import { HotelService } from './hotel.service';

@Injectable({
  providedIn: 'root'
})
export class PaymentSpeakerService {
  private currentAudio: HTMLAudioElement | null = null;
  private enabledByHotelId = new Map<string, boolean>();
  private lastPlayedEventKey: string | null = null;
  private lastPlayedAt = 0;

  constructor(
    private sepayService: SePayService,
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

  /**
   * Thử phát loa cho payment_received (dedupe audio theo event, không chặn toast UI).
   */
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

    this.sepayService.generatePaymentSound({ message }).subscribe({
      next: (response: any) => {
        const asyncUrl = response?.async;
        if (!asyncUrl) {
          this.speakFallback(message);
          return;
        }

        this.sepayService.getTtsFile(asyncUrl).subscribe({
          next: (audioBlob: Blob) => this.playBlob(audioBlob, message),
          error: (error) => {
            console.error('[PaymentSpeakerService] Lỗi tải file âm thanh:', error);
            this.speakFallback(message);
          }
        });
      },
      error: (error) => {
        console.error('[PaymentSpeakerService] Lỗi tạo giọng đọc:', error);
        this.speakFallback(message);
      }
    });
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
      this.speakFallback(fallbackMessage);
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.error('[PaymentSpeakerService] Trình duyệt chặn autoplay audio:', error);
        cleanup();
        this.speakFallback(fallbackMessage);
      });
    }
  }
}
