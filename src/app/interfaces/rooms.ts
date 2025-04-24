export interface Room {
    _id: string;
    hotelId: string; // ID của khách sạn mà phòng thuộc về
    roomNumber: number; // Số phòng
    floor: number; // Tầng của phòng
    roomType: string; // Loại phòng
    roomStatus: 'active' | 'available' | 'occupied' | 'maintenance' | 'dirty' | 'cleaning'; // Trạng thái phòng
    hourlyRate: number; // Giá theo giờ
    dailyRate: number; // Giá theo ngày
    nightlyRate: number; // Giá theo đêm
    firstHourRate?: number; // Giá giờ đầu tiên
    additionalHourRate?: number; // Giá mỗi giờ tiếp theo
    maxcount: number; // Sức chứa tối đa của phòng
    imageurls: string[]; // Danh sách URL của hình ảnh phòng
    description: string; // Mô tả phòng
    events?: Event[]; // Danh sách sự kiện liên quan đến phòng
    bookingHistory?: BookingHistory[]; // Lịch sử đặt phòng
    services?: string[]; // Danh sách dịch vụ của phòng
    rateType?: 'hourly' | 'daily' | 'nightly'; // Loại giá mặc định
    priceConfigId?: string; // ID cấu hình giá
}

// Interface cho sự kiện
export interface Event {
    type: 'checkin' | 'checkout' | 'notpay' | 'maintenance' | 'service_order'; // Loại sự kiện
    checkinTime?: Date; // Thời gian check-in
    checkoutTime?: Date; // Thời gian check-out
    payment?: number; // Số tiền thanh toán
    userId?: string; // ID người dùng
    staffId?: string; // ID nhân viên
    serviceOrderId?: string; // ID đơn hàng dịch vụ
    guestInfo?: GuestInfo; // Thông tin khách hàng
    selectedServices?: OrderedService[]; // Dịch vụ đã chọn
    paymentMethod?: 'cash' | 'card' | 'transfer'; // Phương thức thanh toán
    advancePayment?: number; // Thanh toán trước
    notes?: string; // Ghi chú
    totalPrice?: number; // Tổng giá
}

// Thông tin khách hàng
export interface GuestInfo {
    name: string;
    idNumber?: string; // Số CMND/CCCD
    phone?: string;
    email?: string;
    address?: string;
}

// Dịch vụ đã đặt
export interface OrderedService {
    serviceId: string;
    serviceName: string;
    quantity: number;
    price: number;
    totalPrice: number;
}

// Interface cho lịch sử đặt phòng
export interface BookingHistory {
    _id?: string; // ID của booking history
    event: 'check-in' | 'check-out' | 'payment' | 'maintenance' | 'cleaning' | 'service'; // Loại sự kiện
    date: Date; // Ngày thực hiện
    bookingId?: string; // ID của booking
    userId?: string; // ID người dùng
    staffId?: string; // ID nhân viên
    amount?: number; // Số tiền (cho sự kiện thanh toán)
    roomNumber?: number; // Số phòng
    roomId?: string; // ID phòng
    serviceDetails?: {
        serviceOrderId?: string;
        amount?: number;
    };
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
    confirmedByPassword: boolean;
    createdAt?: Date;
}
  