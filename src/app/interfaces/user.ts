// import { UserResponse } from '../services/user.service'; // No longer needed

export interface User {
  _id: string;
  username: string;
  email: string;
  password: string; // Ensure this matches backend expectations (e.g., not always present in responses)
  role: string;
  status: 'active' | 'inactive' | 'suspended' | 'deleted';
  businessId?: string;
  hotelId?: string;
  permissions?: string[];
  lastLogin?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  preferences?: {
    theme?: string;
    language?: string;
    notifications?: {
      email?: boolean;
      push?: boolean;
    };
  };
  // Add any other fields that are returned by the backend and needed by the frontend
  // For example, if backend returns fullName, avatar, etc., they should be here.
  fullName?: string;
  avatar?: string;
  phone?: string;
  twoFactorEnabled?: boolean; // Added based on backend model
} 