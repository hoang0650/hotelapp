// import { UserResponse } from '../services/user.service'; // No longer needed

export interface User {
  _id: string;
  username: string;
  email: string;
  password?: string; // Optional vì không phải lúc nào cũng có trong response
  phone?: string;
  fullName?: string;
  role: 'superadmin' | 'admin' | 'business' | 'hotel' | 'staff' | 'guest';
  status: 'active' | 'inactive' | 'suspended' | 'deleted';
  avatar?: string;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  twoFactorEnabled?: boolean;
  businessId?: string;
  hotelId?: string;
  preferences?: {
    language?: string;
    theme?: string;
    notifications?: {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
    };
  };
  permissions?: Array<'view' | 'create' | 'edit' | 'delete' | 'manage_revenue'>;
  metadata?: any;
} 