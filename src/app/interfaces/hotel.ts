import { User } from './user'; // Giả sử bạn có interface User cho managerId
import { Room } from './rooms'; // Giả sử bạn có interface Room

export interface HotelAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  coordinates?: {
    latitude?: number;
    longitude?: number;
  };
}

export interface HotelContactInfo {
  email?: string;
  phone?: string;
  website?: string;
}

export interface HotelNotificationSettings {
  enableEmailNotifications?: boolean;
  enableSMSNotifications?: boolean;
  enablePushNotifications?: boolean;
  notifyOnBooking?: boolean;
  notifyOnCheckin?: boolean;
  notifyOnCheckout?: boolean;
  notifyOnPayment?: boolean;
  notifyOnCancellation?: boolean;
  notifyOnLowInventory?: boolean;
  notifyOnSystemError?: boolean;
  notificationEmail?: string;
}

export interface HotelSettings {
  checkInTime?: string;
  checkOutTime?: string;
  currency?: string;
  language?: string;
  taxRate?: number;
  enableQRPaymentForBankTransfer?: boolean;
  enableOTAManagement?: boolean;
  enableEmailManagement?: boolean;
  enableElectricManagement?: boolean;
  enablePayPalPayment?: boolean;
  enableCryptoPayment?: boolean;
  enableDraftInvoice?: boolean;
  enableExportInvoice?: boolean;
  enableAiChatbox?: boolean;
  notificationSettings?: HotelNotificationSettings;
}

export interface HotelBankAccount {
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  beneficiaryName?: string;
  branch?: string;
  qrPaymentUrl?: string;
}

export type HotelStatus = 'active' | 'inactive' | 'maintenance' | 'suspended';

export interface Hotel {
  _id?: string; // Optional vì khi tạo mới chưa có
  name: string;
  businessId: string | { _id: string; [key: string]: any }; // ID của Business chứa khách sạn này (có thể là string hoặc object khi populated)
  address?: HotelAddress;
  contactInfo?: HotelContactInfo;
  images?: string[];
  managerId?: string | User; // Có thể là ID hoặc User object đã populate
  facilities?: string[];
  description?: string;
  starRating?: number;
  status?: HotelStatus;
  rooms?: string[] | Room[]; // Danh sách ID phòng hoặc Room objects đã populate
  staff?: string[] | User[]; // Danh sách ID nhân viên hoặc User objects đã populate
  settings?: HotelSettings;
  bankAccount?: HotelBankAccount; // Thông tin ngân hàng cho thanh toán chuyển khoản
  createdAt?: Date;
  updatedAt?: Date;
  // phoneNumber?: string; // Đã được gộp vào contactInfo.phone
}