export interface Room {
    _id: string;
    hotelId: string; // ID của khách sạn mà phòng thuộc về
    roomNumber: number; // Số phòng
    roomType: string; // Loại phòng
    roomStatus: 'active' | 'available' | 'dirty'; // Trạng thái phòng
    hourlyRate: number; // Giá theo giờ
    dailyRate: number; // Giá theo ngày
    nightlyRate: number; // Giá theo đêm
    maxcount: number; // Sức chứa tối đa của phòng
    imageurls: string[]; // Danh sách URL của hình ảnh phòng
    description: string; // Mô tả phòng
    events?: Event[]; // Danh sách sự kiện liên quan đến phòng
    bookingHistory?: BookingHistory[]; // Lịch sử đặt phòng
  }
  
  // Interface cho sự kiện
  export interface Event {
    type: 'checkin' | 'checkout' | 'notpay'; // Loại sự kiện
    checkinTime?: Date; // Thời gian check-in
    checkoutTime?: Date; // Thời gian check-out
    payment?: number; // Số tiền thanh toán
  }
  
  // Interface cho lịch sử đặt phòng
  export interface BookingHistory {
    event: 'check-in' | 'check-out' | 'payment'; // Loại sự kiện
    date: Date; // Ngày sự kiện
    bookingId: string; // ID của đặt phòng
    amount?: number; // Số tiền cho sự kiện 'payment'
  }
  