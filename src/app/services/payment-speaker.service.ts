import { Injectable } from '@angular/core';
import { SePayService } from './sepay.service';

@Injectable({
  providedIn: 'root'
})
export class PaymentSpeakerService {
  private currentAudio: HTMLAudioElement | null = null;

  constructor(private sepayService: SePayService) {}

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
          return;
        }

        this.sepayService.getTtsFile(asyncUrl).subscribe({
          next: (audioBlob: Blob) => this.playBlob(audioBlob),
          error: (error) => console.error('[PaymentSpeakerService] Lỗi tải file âm thanh:', error)
        });
      },
      error: (error) => console.error('[PaymentSpeakerService] Lỗi tạo giọng đọc:', error)
    });
  }

  private playBlob(audioBlob: Blob): void {
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
    audio.onerror = cleanup;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.error('[PaymentSpeakerService] Trình duyệt chặn autoplay audio:', error);
        cleanup();
      });
    }
  }
}
