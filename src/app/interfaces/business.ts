import { Hotel } from './hotel';
import { User } from './user'; // Assuming User interface exists for populated ownerId

// Define interfaces for nested objects based on backend model
export interface BusinessAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface BusinessContactInfo {
  email: string; // Kept as required based on backend
  phone: string; // Kept as required based on backend
  website?: string;
}

export interface BusinessSubscription {
  plan?: 'starter' | 'professional' | 'vip';
  startDate?: Date;
  endDate?: Date;
  paymentStatus?: 'active' | 'pending' | 'expired';
  autoRenew?: boolean;
  discount?: number;
  contractYears?: number;
}

export interface BusinessLimits {
  maxHotels?: number;
  maxRoomsPerHotel?: number;
  maxStaffPerHotel?: number;
  features?: {
    otaIntegration?: boolean;
    bankIntegration?: boolean;
    staffManagement?: boolean;
    ai?: boolean;
  };
}

export interface BusinessSettings {
  defaultCurrency?: string;
  defaultLanguage?: string;
  defaultCheckInTime?: string;
  defaultCheckOutTime?: string;
  taxRate?: number;
}

export interface Business {
  _id?: string;
  name: string;
  legalName?: string; // Added
  taxId: string; // Changed from tax_code, type string
  address: BusinessAddress; // Changed to object
  contactInfo: BusinessContactInfo; // Changed from contact, added website
  logo?: string; // Added
  ownerId?: string | User; // Can be string or populated User object
  subscription?: BusinessSubscription; // Added
  limits?: BusinessLimits; // Added
  hotels?: string[] | Hotel[];
  status?: 'pending' | 'active' | 'inactive' | 'suspended'; // Aligned with backend
  settings?: BusinessSettings; // Added
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: any; // Added
  _hotelObjects?: any[]; // Kept if used client-side
}

