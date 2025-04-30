import { UserResponse } from '../services/user.service';

export interface User extends UserResponse {
  _id: string;
  lastLogin?: Date;
  isUpdating?: boolean;
  businessId?: string;
  hotelId?: string;
  permissions?: string[];
} 