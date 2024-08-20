declare module 'qrious' {
    export default class QRious {
      constructor(options?: {
        value?: string;
        size?: number;
        level?: 'L' | 'M' | 'Q' | 'H';
        background?: string;
        foreground?: string;
        padding?: number;
      });
      
      toDataURL(): string;
    }
  }
  