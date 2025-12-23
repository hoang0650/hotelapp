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
  status: 'vacant' | 'occupied' | 'cleaning' | 'dirty' | 'maintenance' | 'booked'; // Đổi từ roomStatus và cập nhật enum
  guestStatus?: 'in' | 'out'; // Trạng thái khách (ở trong/ra ngoài)
  
  pricing?: RoomPricing; // Cấu trúc giá mới
  // Giữ lại các trường này nếu cần cho logic tính giá phức tạp ở client hoặc khi chưa có priceConfigId
  firstHourRate?: number; 
  additionalHourRate?: number;

  priceConfigId?: string;
  priceSettings?: {
    nightlyStartTime?: string; // Giờ bắt đầu tính qua đêm (HH:mm)
    nightlyEndTime?: string; // Giờ kết thúc tính qua đêm (HH:mm)
    dailyStartTime?: string; // Giờ bắt đầu tính theo ngày (HH:mm)
    dailyEndTime?: string; // Giờ kết thúc tính theo ngày (HH:mm)
    autoNightlyHours?: number; // Số giờ tự động chuyển sang tính qua đêm
    gracePeriodMinutes?: number; // Thời gian miễn phí sau giờ thứ 2 (phút)
    timezone?: string; // Múi giờ
    // Phụ thu cho daily rates
    dailyEarlyCheckinSurcharge?: number; // Phụ thu check-in sớm cho thuê theo ngày (số tiền/giờ)
    dailyLateCheckoutFee?: number; // Phí trả phòng muộn cho thuê theo ngày (số tiền/giờ)
    // Phụ thu cho nightly rates
    nightlyEarlyCheckinSurcharge?: number; // Phụ thu check-in sớm cho thuê qua đêm (số tiền/giờ)
    nightlyLateCheckoutSurcharge?: number; // Phụ thu check-out trễ cho thuê qua đêm (số tiền/giờ)
  };
  specialPricing?: SpecialPrice[]; // Mới
  
  lastCleaned?: Date; // Mới
  lastMaintenance?: Date; // Mới
  
  description?: string;
  notes?: string; // Mới
  
  services?: string[]; // Danh sách ID dịch vụ
  events?: Event[]; // Giữ lại, được cập nhật từ controller
  bookingHistory?: BookingHistory[];
  currentBooking?: {
    guestInfo?: GuestInfo;
    checkInDate?: Date;
    checkOutDate?: Date;
    rateType?: 'hourly' | 'daily' | 'nightly';
    advancePayment?: number;
    notes?: string;
    // Thông tin chuyển phòng từ Booking
    transferredFrom?: string; // Room ID phòng ban đầu
    transferredTo?: string; // Room ID phòng đích hiện tại
    transferredAt?: Date; // Thời gian chuyển phòng
    transferredBy?: string; // staffId
    transferHistory?: TransferHistoryItem[]; // Lịch sử chuyển phòng
  } | Booking; // Có thể là object đơn giản hoặc Booking đầy đủ
  
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
export type RoomStatus = 'vacant' | 'occupied' | 'cleaning' | 'dirty' | 'maintenance' | 'booked';

// Interface cho sự kiện trên phòng (checkin, checkout, note...)
export interface Event {
  _id?: string; // ID của event từ RoomEvent collection
  roomId?: string; // ID của phòng (từ RoomEvent collection) - QUAN TRỌNG: để đảm bảo chỉ lấy events của phòng hiện tại
  type: 'checkin' | 'checkout' | 'notpay' | 'maintenance' | 'service_order' | 'transfer' | 'booking' | 'cancel_booking' | 'guest_out' | 'guest_return';
  checkinTime?: Date; 
  checkoutTime?: Date;
  expectedCheckoutTime?: Date; // Thời gian checkout dự kiến cho booking 
  payment?: number; 
  userId?: string; 
  staffId?: string; 
  serviceOrderId?: string; 
  guestInfo?: GuestInfo; 
  selectedServices?: OrderedService[]; 
  paymentMethod?: 'cash' | 'card' | 'transfer'; 
  paymentStatus?: 'paid' | 'pending'; // Trạng thái thanh toán (từ RoomEvent model)
  paymentTransactionId?: string; // ID giao dịch thanh toán (nếu có)
  rateType?: 'hourly' | 'daily' | 'nightly'; // Loại giá
  advancePayment?: number; 
  additionalCharges?: number;
  discount?: number;
  notes?: string; 
  totalPrice?: number;
  // For transfer events
  transferredFrom?: string; // Room ID (phòng nguồn)
  transferredTo?: string; // Room ID (phòng đích)
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
  guestSource?: 'walkin' | 'booking' | 'agoda' | 'traveloka' | 'expedia' | 'trip' | 'g2j' | 'other' | string; // Nguồn khách hàng
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
  event: 'check-in' | 'check-out' | 'payment' | 'maintenance' | 'cleaning' | 'service' | 'transfer' | 'booking' | 'cancel_booking';
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

// Interface cho lịch sử chuyển phòng trong Booking
export interface TransferHistoryItem {
  fromRoomId: string;
  toRoomId: string;
  fromRoomNumber: string;
  toRoomNumber: string;
  transferredAt: Date;
  transferredBy?: string; // staffId
  notes?: string;
  oldBasePrice: number;
  newBasePrice: number;
}

// Interface cho Booking
export interface Booking {
  _id?: string;
  hotelId: string;
  roomId: string;
  guestId?: string;
  checkInDate: Date;
  checkOutDate: Date;
  actualCheckInDate?: Date;
  actualCheckOutDate?: Date;
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
  bookingType: 'hourly' | 'daily' | 'nightly';
  rateType?: 'hourly' | 'daily' | 'nightly'; // Alias cho bookingType để tương thích
  adults?: number;
  children?: number;
  basePrice: number;
  additionalCharges?: Array<{
    description?: string;
    amount: number;
    date?: Date;
  }>;
  discounts?: Array<{
    description?: string;
    amount: number;
    date?: Date;
  }>;
  deposit?: number;
  totalAmount: number;
  paidAmount?: number;
  paymentStatus: 'pending' | 'partial' | 'paid' | 'refunded';
  paymentMethod?: 'cash' | 'credit_card' | 'bank_transfer';
  paymentDetails?: {
    transactionId?: string;
    cardLast4?: string;
    bankReference?: string;
    paymentDate?: Date;
    paymentHistory?: Array<{
      amount: number;
      date: Date;
      method: string;
      staffId?: string;
      transactionId?: string;
    }>;
  };
  services?: Array<{
    serviceId?: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    date?: Date;
  }>;
  source?: 'direct' | 'ota' | 'phone' | 'walk_in';
  otaSource?: string;
  otaBookingId?: string;
  guestDetails?: {
    name?: string;
    email?: string;
    phone?: string;
    idType?: string;
    idNumber?: string;
  };
  guestInfo?: GuestInfo; // Alias cho guestDetails để tương thích với code hiện tại
  notes?: string;
  createdBy?: string;
  logs?: Array<{
    action: string;
    timestamp: Date;
    userId?: string;
    staffId?: string;
    details?: string;
  }>;
  // Thông tin chuyển phòng
  transferredFrom?: string; // Room ID phòng ban đầu
  transferredTo?: string; // Room ID phòng đích hiện tại
  transferredAt?: Date; // Thời gian chuyển phòng
  transferredBy?: string; // staffId người thực hiện chuyển phòng
  transferHistory?: TransferHistoryItem[]; // Lịch sử các lần chuyển phòng
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: any;
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
  