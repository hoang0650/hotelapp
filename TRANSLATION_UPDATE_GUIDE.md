# Hướng dẫn Cập nhật Translation cho Các Component Còn Lại

## Đã hoàn thành
- ✅ ROOM component (room.component.html, room.component.ts)
- ✅ Translation keys đã được thêm vào vi.json, en.json, de.json

## Cần cập nhật

### 1. ROOM_CONTENT_MODAL Component
**File:** `hotelapp/src/app/components/room-content-modal/room-content-modal.component.html`
**File:** `hotelapp/src/app/components/room-content-modal/room-content-modal.component.ts`

**Các text cần translate:**
- "Nhận phòng", "Trả phòng", "Dọn phòng"
- "Giá tham khảo", "Theo giờ", "Theo ngày", "Qua đêm"
- "Thông tin khách hàng", "Tên khách hàng", "Số CMND/CCCD", etc.
- "Thông tin thanh toán", "Phương thức thanh toán", etc.
- Tất cả các label, placeholder, button text

**Cách làm:**
1. Thêm translation keys vào vi.json, en.json, de.json trong section "ROOM_CONTENT_MODAL"
2. Thay thế hardcode text bằng `{{ 'ROOM_CONTENT_MODAL.KEY' | translate }}`
3. Cập nhật TypeScript messages để sử dụng `this.translate.instant('KEY')`

### 2. REVENUE_CHART Component
**File:** `hotelapp/src/app/components/revenue-chart/revenue-chart.component.html`
**File:** `hotelapp/src/app/components/revenue-chart/revenue-chart.component.ts`

### 3. TABLE Component
**File:** `hotelapp/src/app/components/table/table.component.html`
**File:** `hotelapp/src/app/components/table/table.component.ts`

### 4. SHIFT_HANDOVER Component
**File:** `hotelapp/src/app/components/shift-handover/shift-handover.component.html`
**File:** `hotelapp/src/app/components/shift-handover/shift-handover.component.ts`

### 5. Các Component Còn Lại
- shift-handover-history
- calendar
- caliendar-modal
- room-context-menu
- company-management
- hotel-management
- room-management
- staff-management
- guest-management
- service-management
- ota-management
- tuya-switch (đã có một phần)
- home
- blog
- contact
- contact-management
- blog-management
- login
- signup
- settings
- debt-management
- financial-summary-report
- bank-transfer-history
- pricing-management
- email-admin

## Quy trình cập nhật

### Bước 1: Thêm Translation Keys
1. Mở `hotelapp/src/assets/i18n/vi.json`
2. Thêm section mới cho component (ví dụ: "ROOM_CONTENT_MODAL": { ... })
3. Thêm tất cả keys cần thiết
4. Làm tương tự cho `en.json` và `de.json`

### Bước 2: Cập nhật HTML Template
1. Tìm tất cả hardcode text trong `.html` file
2. Thay thế bằng `{{ 'COMPONENT_NAME.KEY' | translate }}`
3. Với dynamic text, sử dụng `[nzLabel]="'KEY' | translate"` hoặc `[nzPlaceHolder]="'KEY' | translate"`

### Bước 3: Cập nhật TypeScript
1. Import `TranslateService`:
   ```typescript
   import { TranslateService } from '@ngx-translate/core';
   ```
2. Inject vào constructor:
   ```typescript
   constructor(..., private translate: TranslateService) {}
   ```
3. Thay thế hardcode messages:
   ```typescript
   // Trước
   this.message.success('Tạo thành công');
   
   // Sau
   this.message.success(this.translate.instant('COMMON.CREATE_SUCCESS'));
   ```

## Lưu ý

1. **Luôn thêm translation cho cả 3 ngôn ngữ** (vi, en, de)
2. **Sử dụng nested keys** để tổ chức tốt hơn (ví dụ: `ROOM_CONTENT_MODAL.GUEST_INFO.NAME`)
3. **Kiểm tra lại sau khi cập nhật** để đảm bảo không có text nào bị bỏ sót
4. **Test chuyển đổi ngôn ngữ** trên header để đảm bảo tất cả text được translate đúng

## Ví dụ

### HTML Template
```html
<!-- Trước -->
<h3>Nhận phòng {{ roomData.roomNumber }}</h3>
<button>Xác nhận</button>

<!-- Sau -->
<h3>{{ 'ROOM_CONTENT_MODAL.CHECKIN_TITLE' | translate }} {{ roomData.roomNumber }}</h3>
<button>{{ 'COMMON.CONFIRM' | translate }}</button>
```

### TypeScript
```typescript
// Trước
this.message.success('Tạo thành công');

// Sau
this.message.success(this.translate.instant('COMMON.CREATE_SUCCESS'));
```

