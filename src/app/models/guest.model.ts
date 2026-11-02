export interface GuestPersonalInfo {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  dateOfBirth?: Date;
  gender?: string;
  nationality?: string;
  idType?: 'passport' | 'id_card' | 'driver_license';
  idNumber?: string;
  idExpiryDate?: Date;
  idScanUrl?: string;
}

export interface GuestContactInfo {
  email?: string;
  phone?: string;
  alternativePhone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  };
}

export interface GuestPreferences {
  roomType?: string;
  floor?: string;
  specialRequests?: string[];
  dietaryRestrictions?: string[];
}

export interface GuestStayHistory {
  bookingId?: string;
  checkInDate?: Date;
  checkOutDate?: Date;
  roomNumber?: string;
  totalSpent?: number;
  rating?: number;
  feedback?: string;
}

export interface Guest {
  _id?: string;
  userId?: string;
  hotelId: string | { _id: string; name?: string; [key: string]: any };
  businessId?: string | { _id: string; name?: string; [key: string]: any };
  guestType?: 'regular' | 'frequent' | 'group'; // regular: khách lưu, frequent: khách quen, group: khách đoàn
  isGroupLeader?: boolean; // Người đại diện đoàn
  groupId?: string; // ID của đoàn (nếu là thành viên)
  groupMembers?: string[]; // Danh sách thành viên (nếu là leader)
  groupSize?: number; // Số lượng người trong đoàn
  personalInfo?: GuestPersonalInfo;
  contactInfo?: GuestContactInfo;
  preferences?: GuestPreferences;
  stayHistory?: GuestStayHistory[];
  loyaltyPoints?: number;
  loyaltyTier?: 'standard' | 'silver' | 'gold' | 'platinum';
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: any;
}

export interface GuestQuery {
  hotelId?: string;
  page?: number;
  limit?: number;
  search?: string;
  guestType?: 'regular' | 'frequent' | 'group';
}

export interface AssignGuestToRoomRequest {
  guestId: string;
  roomId: string;
  checkInTime?: Date;
  rateType?: string;
  guestInfo?: any;
}

export interface CreateBookingForGuestRequest {
  roomId: string;
  checkInDate: Date | string;
  checkOutDate?: Date | string;
  rateType?: 'hourly' | 'daily' | 'nightly';
  advancePayment?: number;
  notes?: string;
  adults?: number;
  children?: number;
} 