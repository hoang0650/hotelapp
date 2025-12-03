export interface RoomCapacity {
  adults?: number;
  children?: number;
}

export interface RoomPricing {
  hourly?: number;
  daily?: number;
  nightly?: number;
  weekly?: number;
  monthly?: number;
  currency?: string;
}

export interface SpecialPrice {
  startDate: Date;
  endDate: Date;
  hourly?: number;
  daily?: number;
  nightly?: number;
  weekly?: number;
  monthly?: number;
  reason?: 'season' | 'holiday' | 'promotion' | 'other';
}

export interface RoomRevenueHistoryItem {
  date: Date;
  amount: number;
  bookingId?: string; // ID của Booking liên quan
}

export interface RoomRevenue {
  total?: number;
  history?: RoomRevenueHistoryItem[];
}

export interface Room {
  _id: string;
  hotelId: string;
  roomNumber: string; // Đổi sang string
  floor: string; // Đổi sang string
  type: string; // Đổi từ roomType
  capacity?: RoomCapacity; // Thay thế maxcount
  amenities?: string[]; // Mới
  images?: string[]; // Đổi từ imageurls
  status: 'vacant' | 'occupied' | 'cleaning' | 'dirty' | 'maintenance'; // Đổi từ roomStatus và cập nhật enum
  
  pricing?: RoomPricing; // Cấu trúc giá mới
  // Giữ lại các trường này nếu cần cho logic tính giá phức tạp ở client hoặc khi chưa có priceConfigId
  firstHourRate?: number; 
  additionalHourRate?: number;

  priceConfigId?: string;
  specialPricing?: SpecialPrice[]; // Mới
  
  lastCleaned?: Date; // Mới
  lastMaintenance?: Date; // Mới
  
  description?: string;
  notes?: string; // Mới
  
  services?: string[]; // Danh sách ID dịch vụ
  events?: Event[]; // Giữ lại, được cập nhật từ controller
  bookingHistory?: BookingHistory[];
  
  revenue?: RoomRevenue; // Mới
  
  createdAt?: Date; // Mới
  updatedAt?: Date; // Mới
  metadata?: any; // Mới (Record<string, any> cũng được)

  // Các trường cũ có thể bỏ nếu đã được thay thế hoàn toàn:
  // hourlyRate: number; // (đã trong pricing)
  // dailyRate: number; // (đã trong pricing)
  // nightlyRate: number; // (đã trong pricing)
  // maxcount: number; // (đã trong capacity)
  // roomType: string; // (đã là type)
  // roomStatus: 'active' | 'available' | 'occupied' | 'maintenance' | 'dirty' | 'cleaning'; // (đã là status)
  // imageurls: string[]; // (đã là images)
  // rateType?: 'hourly' | 'daily' | 'nightly'; // Cân nhắc bỏ nếu priceConfigId hoặc pricing đã đủ
}

// Định nghĩa type cho RoomStatus để có thể export và sử dụng ở component khác
export type RoomStatus = 'vacant' | 'occupied' | 'cleaning' | 'dirty' | 'maintenance';

// Interface cho sự kiện trên phòng (checkin, checkout, note...)
export interface Event {
  type: 'checkin' | 'checkout' | 'notpay' | 'maintenance' | 'service_order' | 'transfer'; // Thêm transfer
  checkinTime?: Date; 
  checkoutTime?: Date; 
  payment?: number; 
  userId?: string; 
  staffId?: string; 
  serviceOrderId?: string; 
  guestInfo?: GuestInfo; 
  selectedServices?: OrderedService[]; 
  paymentMethod?: 'cash' | 'card' | 'transfer'; 
  rateType?: 'hourly' | 'daily' | 'nightly'; // Loại giá
  advancePayment?: number; 
  additionalCharges?: number;
  discount?: number;
  notes?: string; 
  totalPrice?: number;
  // For transfer events
  transferredFrom?: string; // Room ID
  transferredAt?: Date;
  transferredBy?: string; // staffId
}

// Thông tin khách hàng
export interface GuestInfo {
  name: string;
  idNumber?: string; 
  phone?: string;
  email?: string;
  address?: string;
}

// Dịch vụ đã đặt trong một ServiceOrder (cũng dùng trong Event)
export interface OrderedService {
  serviceId: string;
  serviceName: string;
  price: number;
  quantity: number;
  totalPrice?: number;
  orderTime?: Date;
  notes?: string;
}

// Interface cho lịch sử đặt phòng (một mục trong mảng Room.bookingHistory)
export interface BookingHistory {
  _id?: string; 
  event: 'check-in' | 'check-out' | 'payment' | 'maintenance' | 'cleaning' | 'service' | 'transfer'; // Thêm 'transfer'
  date: Date; 
  bookingId?: string; 
  userId?: string; 
  staffId?: string; 
  amount?: number;
  // Các trường mới/cập nhật từ backend schema
  additionalCharges?: number;
  discount?: number;
  totalAmount?: number; // Tổng tiền cuối cùng của mục lịch sử này
  serviceDetails?: {
    serviceOrderId?: string;
    amount?: number;
  };
  notes?: string; // Thêm notes cho booking history item
  // For transfer events
  targetRoomId?: string;
  targetRoomNumber?: string;

  // Các trường có thể cần để hiển thị, không nhất thiết phải từ schema
  roomNumber?: string; // Số phòng (lấy từ Room)
  roomId?: string; // ID phòng (lấy từ Room)
  customerName?: string;
  customerPhone?: string;
  staffName?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  checkInTime?: Date; // Thường là một phần của event 'check-out'
  // checkOutTime?: Date; // Đã có date là thời điểm của event
}

// Mô hình cho giao ca
export interface ShiftHandover {
  id?: string;
  hotelId: string;
  fromStaffId: string; 
  toStaffId: string;
  handoverTime: Date;
  notes?: string;
  cashAmount: number;
  confirmedByPassword?: boolean; // Backend không có trường này, controller xử lý logic password
  createdAt?: Date;
}
  