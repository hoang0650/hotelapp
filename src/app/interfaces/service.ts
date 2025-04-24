export interface Service {
  _id?: string;
  name: string;
  description: string;
  price: number;
  category: string;
  hotelId: string;
  image?: string;
  isAvailable: boolean;
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