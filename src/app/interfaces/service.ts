export type ServiceCategory = 'room_service' | 'food' | 'beverage' | 'spa' | 'transport' | 'custom';

export const ALL_SERVICE_CATEGORIES: ServiceCategory[] = [
  'room_service', 'food', 'beverage', 'spa', 'transport', 'custom'
];

export interface Service {
  _id?: string;
  name: string;
  description: string;
  price: number;
  category: ServiceCategory;
  hotelId: string;
  image?: string;
  isActive: boolean;
  currency?: string;
  isCustom?: boolean;
  // Quản lý kho
  costPrice?: number;
  importQuantity?: number;
  salesQuantity?: number;
  inventory?: number;
  metadata?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ServiceOrderItem {
  serviceId: string;
  serviceName: string;
  quantity: number;
  price: number;
  totalPrice: number;
}

export interface ServiceOrder {
  _id?: string;
  roomId: string;
  hotelId: string;
  services: ServiceOrderItem[];
  totalAmount: number;
  status?: 'pending' | 'processing' | 'completed' | 'cancelled';
  requestTime?: Date;
  completedTime?: Date;
  staffId?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
} 