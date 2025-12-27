# Hướng dẫn Hoàn thiện Translation cho Tất cả Component

## Tổng quan
File này hướng dẫn cách cập nhật translation cho tất cả các component còn lại trong hệ thống.

## Đã hoàn thành ✅
1. **ROOM Component** - Đã cập nhật đầy đủ
2. **ROOM_CONTENT_MODAL Component** - Đã cập nhật một phần (cần tiếp tục)
3. **Translation Keys** - Đã thêm vào vi.json, en.json, de.json

## Cần cập nhật

### Các Component Còn Lại:
1. revenue-chart
2. table
3. shift-handover
4. shift-handover-history
5. calendar
6. caliendar-modal
7. room-context-menu
8. company-management
9. hotel-management
10. room-management
11. staff-management
12. guest-management
13. service-management
14. ota-management
15. tuya-switch (đã có một phần)
16. home
17. blog
18. contact
19. contact-management
20. blog-management
21. login
22. signup
23. settings
24. debt-management
25. financial-summary-report
26. bank-transfer-history
27. pricing-management
28. email-admin

## Quy trình Cập nhật cho Mỗi Component

### Bước 1: Thêm Translation Keys vào vi.json, en.json, de.json

Ví dụ cho REVENUE_CHART:
```json
"REVENUE_CHART": {
  "TITLE": "Biểu đồ doanh thu",
  "TOTAL_REVENUE": "Tổng doanh thu",
  "TOTAL_PAYMENT": "Tổng thanh toán",
  "TOTAL_EXPENSE": "Tổng chi",
  "PERIOD": "Khoảng thời gian",
  "DAY": "Ngày",
  "WEEK": "Tuần",
  "MONTH": "Tháng"
}
```

### Bước 2: Cập nhật HTML Template

**Tìm và thay thế:**
```html
<!-- Trước -->
<h3>Biểu đồ doanh thu</h3>
<button>Xem chi tiết</button>

<!-- Sau -->
<h3>{{ 'REVENUE_CHART.TITLE' | translate }}</h3>
<button>{{ 'COMMON.VIEW_DETAILS' | translate }}</button>
```

**Với dynamic attributes:**
```html
<!-- Trước -->
<nz-select nzPlaceHolder="Chọn khoảng thời gian">

<!-- Sau -->
<nz-select [nzPlaceHolder]="'REVENUE_CHART.SELECT_PERIOD' | translate">
```

### Bước 3: Cập nhật TypeScript

**Import TranslateService:**
```typescript
import { TranslateService } from '@ngx-translate/core';
```

**Inject vào constructor:**
```typescript
constructor(
  // ... other services
  private translate: TranslateService
) {}
```

**Cập nhật messages:**
```typescript
// Trước
this.message.success('Tạo thành công');

// Sau
this.message.success(this.translate.instant('COMMON.CREATE_SUCCESS'));
```

## Translation Keys Mẫu cho Các Component

### REVENUE_CHART
```json
"REVENUE_CHART": {
  "TITLE": "Biểu đồ doanh thu",
  "TOTAL_REVENUE": "Tổng doanh thu",
  "TOTAL_PAYMENT": "Tổng thanh toán",
  "TOTAL_EXPENSE": "Tổng chi",
  "PERIOD": "Khoảng thời gian",
  "DAY": "Ngày",
  "WEEK": "Tuần",
  "MONTH": "Tháng",
  "SELECT_PERIOD": "Chọn khoảng thời gian"
}
```

### TABLE
```json
"TABLE": {
  "TITLE": "Lịch sử phòng",
  "ROOM_NUMBER": "Số phòng",
  "CUSTOMER_NAME": "Tên khách hàng",
  "CHECKIN_TIME": "Thời gian nhận phòng",
  "CHECKOUT_TIME": "Thời gian trả phòng",
  "TOTAL_AMOUNT": "Tổng tiền",
  "PAYMENT_METHOD": "Phương thức thanh toán",
  "VIEW_INVOICE": "Xem hóa đơn",
  "NO_DATA": "Không có dữ liệu",
  "SEARCH": "Tìm kiếm",
  "FILTER": "Lọc"
}
```

### SHIFT_HANDOVER
```json
"SHIFT_HANDOVER": {
  "TITLE": "Giao ca",
  "FROM_STAFF": "Nhân viên giao ca",
  "TO_STAFF": "Nhân viên nhận ca",
  "CASH_AMOUNT": "Số tiền mặt",
  "NOTES": "Ghi chú",
  "SUBMIT": "Xác nhận giao ca",
  "CANCEL": "Hủy"
}
```

### LOGIN
```json
"LOGIN": {
  "TITLE": "Đăng nhập",
  "USERNAME": "Tên đăng nhập",
  "PASSWORD": "Mật khẩu",
  "REMEMBER_ME": "Ghi nhớ đăng nhập",
  "FORGOT_PASSWORD": "Quên mật khẩu?",
  "LOGIN_BUTTON": "Đăng nhập",
  "SIGNUP_LINK": "Chưa có tài khoản? Đăng ký ngay"
}
```

### SIGNUP
```json
"SIGNUP": {
  "TITLE": "Đăng ký",
  "FULL_NAME": "Họ và tên",
  "USERNAME": "Tên đăng nhập",
  "EMAIL": "Email",
  "PASSWORD": "Mật khẩu",
  "CONFIRM_PASSWORD": "Xác nhận mật khẩu",
  "SIGNUP_BUTTON": "Đăng ký",
  "HAVE_ACCOUNT": "Đã có tài khoản? Đăng nhập"
}
```

## Lưu ý Quan Trọng

1. **Luôn thêm translation cho cả 3 ngôn ngữ** (vi, en, de)
2. **Sử dụng COMMON keys** cho các text dùng chung (SAVE, CANCEL, DELETE, etc.)
3. **Kiểm tra lại sau khi cập nhật** để đảm bảo không có text nào bị bỏ sót
4. **Test chuyển đổi ngôn ngữ** trên header để đảm bảo tất cả text được translate đúng
5. **Với dynamic text**, sử dụng `[nzLabel]="'KEY' | translate"` thay vì `nzLabel="Text"`
6. **Với error messages**, sử dụng `[nzErrorTip]="'KEY' | translate"`

## Script Tự Động (Tùy chọn)

Bạn có thể tạo một script Node.js để tự động tìm và thay thế các hardcode text, nhưng cần kiểm tra kỹ sau khi chạy.

## Checklist cho Mỗi Component

- [ ] Thêm translation keys vào vi.json
- [ ] Thêm translation keys vào en.json
- [ ] Thêm translation keys vào de.json
- [ ] Cập nhật HTML template (thay thế hardcode text)
- [ ] Import TranslateService vào TypeScript
- [ ] Inject TranslateService vào constructor
- [ ] Cập nhật messages trong TypeScript
- [ ] Test chuyển đổi ngôn ngữ
- [ ] Kiểm tra không có text nào bị bỏ sót

