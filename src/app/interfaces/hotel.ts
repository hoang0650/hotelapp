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

export interface HotelSettings {
  checkInTime?: string;
  checkOutTime?: string;
  currency?: string;
  language?: string;
  taxRate?: number;
}

export type HotelStatus = 'active' | 'inactive' | 'maintenance' | 'suspended';

export interface Hotel {
  _id?: string; // Optional vì khi tạo mới chưa có
  name: string;
  businessId: string; // ID của Business chứa khách sạn này
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
  createdAt?: Date;
  updatedAt?: Date;
  // phoneNumber?: string; // Đã được gộp vào contactInfo.phone
}