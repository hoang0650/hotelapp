export interface User {
  _id?: string;
  userId: string;
  username: string;
  email: string;
  role: 'admin' | 'business' | 'hotel' | 'staff' | 'customer';
  hotelId?: string;
  businessId?: string;
  permissions?: string[];
  avatar?: string;
  blocked?: boolean;
  online?: boolean;
} 