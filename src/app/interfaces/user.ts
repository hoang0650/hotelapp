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
  bankAccount?: {
    bankName?: string;
    accountNumber?: string;
    accountHolderName?: string;
    beneficiaryName?: string; // Tên người thụ hưởng (hiển thị trên QR code)
    branch?: string;
    swiftCode?: string;
    iban?: string;
    qrPaymentUrl?: string; // Link QR thanh toán SePay
  };
  personalInfo?: {
    dateOfBirth?: Date;
    gender?: string;
    nationality?: string;
    idCard?: string;
    idCardIssueDate?: Date;
    idCardIssuePlace?: string;
    address?: {
      street?: string;
      ward?: string;
      district?: string;
      city?: string;
      country?: string;
      postalCode?: string;
    };
  };
} 