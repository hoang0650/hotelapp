# PayPal Payment Component

Component tích hợp PayPal để thanh toán khi đăng ký gói dịch vụ.

## Cấu hình

### 1. Lấy PayPal Client ID

1. Đăng nhập vào [PayPal Developer Dashboard](https://developer.paypal.com/)
2. Tạo ứng dụng mới hoặc sử dụng ứng dụng hiện có
3. Copy **Client ID** (Sandbox hoặc Production)

### 2. Cấu hình trong Environment

Mở file `hotelapp/src/environments/environment.ts` và cập nhật:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  paypalClientId: 'YOUR_PAYPAL_CLIENT_ID' // Thay bằng Client ID thực tế
};
```

### 3. Sử dụng Component

Component được tích hợp sẵn trong `pricing.component.html`. Khi người dùng bấm "Đăng ký", modal PayPal sẽ tự động hiển thị.

## Tính năng

- ✅ Tích hợp PayPal SDK
- ✅ Hiển thị thông tin thanh toán (gói, giá, hình thức)
- ✅ Xử lý callback sau khi thanh toán thành công
- ✅ Tự động đăng ký gói sau khi thanh toán thành công
- ✅ Lưu thông tin thanh toán vào database

## Lưu ý

- **Development**: Sử dụng PayPal Sandbox Client ID
- **Production**: Sử dụng PayPal Production Client ID
- Đảm bảo đã cấu hình PayPal Client ID trước khi sử dụng
- Component sẽ tự động load PayPal SDK khi modal được mở

## API Backend

Backend đã được cập nhật để nhận `paymentId` và `paymentMethod` khi đăng ký gói:

```javascript
POST /pricing-packages/subscribe
{
  "userId": "string",
  "packageId": "string",
  "billingType": "monthly" | "yearly",
  "paymentId": "string", // Optional: PayPal payment ID
  "paymentMethod": "paypal" // Optional: Payment method
}
```

