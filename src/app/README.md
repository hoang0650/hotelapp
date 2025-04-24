# Hướng dẫn sử dụng RoomSessionService

`RoomSessionService` giúp lưu trữ và quản lý dữ liệu phòng trong quá trình từ nhận phòng đến trả phòng. Nó giải quyết vấn đề mất dữ liệu giữa các thao tác.

## Ưu điểm

1. **Lưu trữ tạm thời**: Lưu thông tin phòng, khách hàng, dịch vụ trong thời gian có khách.
2. **Bền bỉ**: Dữ liệu được lưu trong localStorage, không bị mất khi refresh trang.
3. **Phản ứng tức thì**: Sử dụng BehaviorSubject để các component có thể lắng nghe thay đổi.

## Cách sử dụng

### 1. Bắt đầu phiên khi nhận phòng

```typescript
// Trong component nhận phòng
this.roomSessionService.startSession(roomId, {
  roomId: room._id,
  roomNumber: room.roomNumber,
  roomType: room.roomType,
  hotelId: room.hotelId,
  checkinTime: new Date(),
  guestInfo: guestFormData,
  paymentMethod: paymentMethod,
  rateType: 'hourly',
  advancePayment: advancePayment,
  selectedServices: []
});
```

### 2. Cập nhật dịch vụ

```typescript
// Thêm dịch vụ
this.roomSessionService.addService(roomId, {
  serviceId: service.id,
  serviceName: service.name,
  quantity: 2,
  price: service.price,
  totalPrice: service.price * 2
});

// Xóa dịch vụ
this.roomSessionService.removeService(roomId, indexToRemove);
```

### 3. Lấy dữ liệu phiên

```typescript
// Lấy ngay lập tức
const session = this.roomSessionService.getSession(roomId);
if (session) {
  // Sử dụng dữ liệu
}

// Lắng nghe thay đổi
this.sessionSubscription = this.roomSessionService
  .getSessionObservable(roomId)
  .subscribe(session => {
    if (session) {
      // Cập nhật UI từ dữ liệu session
    }
  });
```

### 4. Kết thúc phiên khi trả phòng

```typescript
// Lưu dữ liệu phiên cuối cùng trước khi xóa
const finalSession = this.roomSessionService.endSession(roomId);
```

## Lưu ý

1. Nhớ unsubscribe trong ngOnDestroy để tránh memory leak.
2. Dữ liệu được lưu trong localStorage sẽ được nạp lại khi refresh trang.
3. Sử dụng RoomSessionService cho các thao tác tạm thời, không thay thế cơ sở dữ liệu.

## Cấu trúc dữ liệu RoomSession

```typescript
export interface RoomSession {
  roomId: string;          // ID phòng
  roomNumber: number;      // Số phòng
  roomType: string;        // Loại phòng
  hotelId: string;         // ID khách sạn
  checkinTime: Date;       // Thời gian nhận phòng
  guestInfo?: GuestInfo;   // Thông tin khách hàng
  paymentMethod?: string;  // Phương thức thanh toán
  rateType?: string;       // Loại giá (hourly, daily, nightly)
  advancePayment?: number; // Thanh toán trước
  notes?: string;          // Ghi chú
  selectedServices: OrderedService[]; // Dịch vụ đã chọn
}
``` 