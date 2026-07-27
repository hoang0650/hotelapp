# Gói giá PHHotel — PMS + AI Agent + OpenClaw

Tài liệu định vị gói dịch vụ cho thị trường **quản lý khách sạn / nhà nghỉ / homestay Việt Nam**, bám theo tính năng thực tế của hệ thống PHHotel (web + app + PHGroup-AI + OpenClaw).

> Mục tiêu: dễ bán cho SME Việt Nam, lộ trình nâng cấp rõ, tách **vận hành lễ tân** và **AI bán phòng / AI điều hành**.

---

## 1. Định vị thị trường

| Phân khúc | Nhu cầu chính | Điểm đau | Gói đề xuất |
|-----------|---------------|----------|-------------|
| Homestay / nhà nghỉ 5–20 phòng | Check-in nhanh, tính giờ/đêm, QR cọc | Excel thủ công, sót tiền | **Khởi Đầu** → **Vận Hành** |
| KS nhỏ 20–50 phòng | Ca làm việc, thu chi, hóa đơn | Nhân sự mỏng, kênh Zalo lộn xộn | **Vận Hành** → **Tăng Trưởng** |
| KS vừa / boutique 50–120 phòng | OTA + bot bán phòng + báo cáo | Overbooking, phản hồi chậm | **Tăng Trưởng** → **AI Pro** |
| Chuỗi / tập đoàn | Đa cơ sở, AI nội bộ, SLA | Đồng bộ dữ liệu, quyền hạn | **Chuỗi / Enterprise** |

**One-liner bán hàng:**  
*PHHotel — phần mềm quản lý khách sạn Việt Nam: vận hành phòng + SePay + hóa đơn điện tử + bot bán phòng Zalo/Facebook/Telegram + AI Agent / OpenClaw.*

---

## 2. Nguyên tắc thiết kế gói

1. **Giá “cảm giác dễ chịu”** theo thói quen SME VN: trả tháng hoặc năm (−15% ~ −20%).
2. **Giới hạn theo số phòng + số user** (đúng `maxRooms` / `maxUsers` trên PricingPackage).
3. **Addon AI / kênh chat / OTA / điện Tuya** mở theo tầng — không nhồi hết vào gói rẻ.
4. Gói miễn phí chỉ để **onboarding & demo**, không cạnh tranh gói trả phí.
5. Enterprise = **Liên hệ** (`isContactOnly`), không niêm yết cứng.

---

## 3. Bảng gói đề xuất (niêm yết)

| Gói | Đối tượng | maxRooms | maxUsers | Giá tháng | Giá năm | Giảm năm |
|-----|-----------|----------|----------|-----------|---------|----------|
| **Dùng Thử** | Demo / tự trải nghiệm | 8 | 2 | **0đ** | **0đ** | — |
| **Khởi Đầu** | Homestay, nhà nghỉ nhỏ | 20 | 5 | **299.000đ** | **2.990.000đ** | ~17% |
| **Vận Hành** | KS nhỏ, cần ca & tài chính | 50 | 15 | **699.000đ** | **6.990.000đ** | ~17% |
| **Tăng Trưởng** | KS có OTA + bán phòng MXH | 100 | 30 | **1.490.000đ** | **14.900.000đ** | ~17% |
| **AI Pro** | KS muốn AI Agent + OpenClaw đầy đủ | 200 | 50 | **2.990.000đ** | **29.900.000đ** | ~17% |
| **Chuỗi / Enterprise** | Multi-hotel, SLA, tùy biến | Không giới hạn* | Không giới hạn* | **Liên hệ** | **Liên hệ** | — |

\* Giới hạn thực tế thỏa thuận theo hợp đồng (thường map `maxHotels` / `maxRoomsPerHotel` phía Business).

> Giá tham khảo thị trường VN 2026 cho PMS SME. Có thể điều chỉnh ±10–15% theo vùng (Hà Nội / HCM / tỉnh).

---

## 4. Ma trận tính năng theo gói

### 4.1. Vận hành cốt lõi

| Tính năng | Mã feature / flag | Dùng Thử | Khởi Đầu | Vận Hành | Tăng Trưởng | AI Pro | Enterprise |
|-----------|-------------------|:--------:|:--------:|:--------:|:-----------:|:------:|:----------:|
| Quản lý phòng (web + app) | `room_management` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Giá giờ / ngày / đêm / tuần / tháng | (core) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Check-in / check-out / giữ phòng | (core) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dịch vụ / minibar | `service_management` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lịch đặt phòng | `calendar` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quản lý khách / công nợ | (core / debt) | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ |
| OCR CCCD / GPLX / Passport | OCR AI | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Giao ca lễ tân | `shift_handover` | — | — | ✅ | ✅ | ✅ | ✅ |
| Quản lý nhân sự | `staff_management` | — | ◐ | ✅ | ✅ | ✅ | ✅ |
| Quản lý khách sạn / công ty | `hotel_management`, `company_management` | — | — | ◐ | ✅ | ✅ | ✅ |

> ◐ = giới hạn nhẹ (số lượng hoặc chỉ xem).

### 4.2. Tài chính & thanh toán

| Tính năng | Mã feature / flag | Dùng Thử | Khởi Đầu | Vận Hành | Tăng Trưởng | AI Pro | Enterprise |
|-----------|-------------------|:--------:|:--------:|:--------:|:-----------:|:------:|:----------:|
| Phiếu thu / phiếu chi | (transactions) | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Biểu đồ doanh thu | `revenue_chart` | — | ◐ | ✅ | ✅ | ✅ | ✅ |
| Báo cáo tài chính tổng hợp | `financial_summary_report` | — | — | ✅ | ✅ | ✅ | ✅ |
| QR / chuyển khoản SePay | `qr_payment`, `qrPaymentFeature` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lịch sử chuyển khoản | `bank_transfer_history` | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hóa đơn nháp | `draftInvoiceFeature` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Xuất hóa đơn / HĐĐT | `exportInvoiceFeature` | — | — | ✅ | ✅ | ✅ | ✅ |
| Visa / cổng thẻ | `visa_payment` | — | — | — | ✅ | ✅ | ✅ |
| PayPal | `paypalPaymentFeature` | — | — | — | ◐ | ✅ | ✅ |
| Crypto | `cryptoPaymentFeature` | — | — | — | — | ◐ | ✅ |

### 4.3. Kênh bán phòng & OTA

| Tính năng | Mã feature / flag | Dùng Thử | Khởi Đầu | Vận Hành | Tăng Trưởng | AI Pro | Enterprise |
|-----------|-------------------|:--------:|:--------:|:--------:|:-----------:|:------:|:----------:|
| Đồng bộ OTA (Agoda, Booking, Traveloka, Trip, Expedia…) | `ota_management`, `otaManagementFeature` | — | — | — | ✅ | ✅ | ✅ |
| Inbox Fanpage / Messenger | `fanpage_messages` | — | — | — | ✅ | ✅ | ✅ |
| Inbox Zalo OA | `zalo_messages` | — | — | — | ✅ | ✅ | ✅ |
| Telegram Bot | `telegram_messages` | — | — | — | ✅ | ✅ | ✅ |
| Sale Agent 5 bước (tư vấn → loại phòng → chốt → cọc → xác nhận) | PHGroup-AI channel | — | — | — | ✅ | ✅ | ✅ |
| Cọc SePay tự động + tạo booking | chat_engine sales flow | — | — | — | ✅ | ✅ | ✅ |

### 4.4. AI Agent & OpenClaw

| Tính năng | Mã / thành phần | Dùng Thử | Khởi Đầu | Vận Hành | Tăng Trưởng | AI Pro | Enterprise |
|-----------|-----------------|:--------:|:--------:|:--------:|:-----------:|:------:|:----------:|
| AI Chatbox nội bộ (hỏi doanh thu, phòng, ca…) | `aiChatboxFeature` | ◐ demo | — | — | ◐ | ✅ | ✅ |
| OpenClaw Gateway (pairing, Control UI) | OpenClaw + API | — | — | — | — | ✅ | ✅ |
| AI hỗ trợ quản trị (OpenClaw management context) | chat_engine / openclaw | — | — | — | — | ✅ | ✅ |
| AI tư vấn khách trên MXH (ưu tiên sales state machine) | channel_ai_context | — | — | — | ✅ | ✅ | ✅ |
| Thông báo khách sạn / loa thanh toán | `hotelNotificationFeature` | — | ◐ | ✅ | ✅ | ✅ | ✅ |
| Email vận hành | `email_management`, `emailManagementFeature` | — | — | ◐ | ✅ | ✅ | ✅ |
| Định mức AI chat / tháng* | — | 30 | — | — | 200 | 2.000 | Theo HĐ |

\* Định mức gợi ý vận hành (quota mềm); có thể gắn billing usage sau.

### 4.5. IoT & nâng cao

| Tính năng | Mã feature / flag | Dùng Thử | Khởi Đầu | Vận Hành | Tăng Trưởng | AI Pro | Enterprise |
|-----------|-------------------|:--------:|:--------:|:--------:|:-----------:|:------:|:----------:|
| Quản lý điện / Tuya | `electric_management`, `electricManagementFeature` | — | — | — | ◐ | ✅ | ✅ |
| Camera AI / hỗ trợ check-in | cameras + OCR | — | — | ◐ | ✅ | ✅ | ✅ |
| Phân quyền sâu / multi-tenant | permissions + business limits | — | — | ◐ | ✅ | ✅ | ✅ |
| Onboarding & training | CSKH | Self-serve | Self-serve | Online | Online + 1 buổi | Dedicated | Dedicated SLA |
| Hỗ trợ | — | Community | Giờ hành chính | Giờ hành chính | Ưu tiên | Ưu tiên + hotline | 24/7 theo HĐ |

---

## 5. Mô tả từng gói (copy bán hàng)

### 5.1. Dùng Thử — 0đ

**Dành cho:** Chủ nhà nghỉ muốn “sờ” phần mềm trước khi trả tiền.

**Có:** Phòng trống/đang ở, check-in cơ bản, QR demo, hóa đơn nháp, OCR giới hạn.  
**Không có:** OTA, bot MXH, OpenClaw, báo cáo sâu.  
**Thời hạn gợi ý:** 14–30 ngày hoặc gói `monthlyPrice = 0` tự gán.

---

### 5.2. Khởi Đầu — 299.000đ/tháng

**Dành cho:** Homestay / nhà nghỉ ≤ 20 phòng, 1–2 người vận hành.

**Giá trị mang lại:**
- Bỏ sổ Excel, tính giờ–đêm đúng.
- Check-in CCCD bằng OCR.
- Nhận cọc / thanh toán QR SePay.
- App mobile lễ tân cơ bản.

**Chốt sale:** *“Rẻ hơn một ca part-time, vận hành chuyên nghiệp hơn Excel.”*

---

### 5.3. Vận Hành — 699.000đ/tháng *(best seller SME)*

**Dành cho:** KS 20–50 phòng cần kỷ luật ca và tiền.

**Thêm so với Khởi Đầu:**
- Giao ca + lịch sử ca.
- Biểu đồ doanh thu + báo cáo tài chính.
- Nhân sự / phân quyền cơ bản.
- Hóa đơn điện tử (trong hạn mức).
- Thông báo thanh toán.

**Chốt sale:** *“Biết tiền vào–ra từng ca, không còn tranh cãi cuối ngày.”*

---

### 5.4. Tăng Trưởng — 1.490.000đ/tháng

**Dành cho:** KS đang bán trên Agoda/Booking và chat Zalo/Fanpage mỗi ngày.

**Thêm:**
- OTA sync & quản lý kênh.
- Bot / inbox Zalo + Facebook + Telegram.
- Sale Agent AI: tư vấn loại phòng → xin tên/SĐT → tạo mã cọc → xác nhận booking khi thanh toán thành công.
- AI Chatbox nội bộ mức nhẹ (quota).

**Chốt sale:** *“Khách nhắn Zalo lúc 1 giờ sáng, bot vẫn tư vấn đúng loại phòng và dẫn cọc.”*

---

### 5.5. AI Pro — 2.990.000đ/tháng

**Dành cho:** KS muốn **AI Agent vận hành** thật sự, không chỉ chatbot FAQ.

**Thêm:**
- OpenClaw đầy đủ (pairing, Control UI, agent nội bộ).
- AI hỏi doanh thu / phòng / ca / quyết định quản trị theo quyền.
- Tuya / điện phòng, PayPal (nếu cần khách quốc tế).
- Quota AI cao, hỗ trợ ưu tiên.

**Chốt sale:** *“Lễ tân bán phòng trên MXH — quản lý hỏi AI/OpenClaw để điều hành.”*

---

### 5.6. Chuỗi / Enterprise — Liên hệ

**Dành cho:** 3+ cơ sở hoặc >200 phòng, cần SLA & tùy biến.

**Bao gồm:** Toàn bộ AI Pro + đa khách sạn (`maxHotels`), SSO/quyền nâng cao, training onsite, tích hợp riêng, báo cáo chuỗi.

**Gợi ý floor giá:** từ **8–15 triệu/tháng** tùy số cơ sở (không public trên landing nếu `isContactOnly`).

---

## 6. Mapping cấu hình vào PricingPackage (kỹ thuật)

Khi tạo gói trên Admin → Quản lý gói giá, map tối thiểu như sau:

### Khởi Đầu
```text
features:
  room_management, service_management, calendar,
  bank_transfer_history, qr_payment
flags:
  qrPaymentFeature=true
  draftInvoiceFeature=true
  hotelNotificationFeature=true
limits:
  maxRooms=20, maxUsers=5
price:
  monthly=299000, yearly=2990000, yearlyDiscount=17
```

### Vận Hành
```text
features: (+ so với Khởi Đầu)
  shift_handover, staff_management, revenue_chart,
  financial_summary_report
flags:
  exportInvoiceFeature=true
  emailManagementFeature=true (tuỳ chọn)
limits:
  maxRooms=50, maxUsers=15
price:
  monthly=699000, yearly=6990000
```

### Tăng Trưởng
```text
features: (+ so với Vận Hành)
  ota_management, fanpage_messages, zalo_messages, telegram_messages,
  hotel_management
flags:
  otaManagementFeature=true
  aiChatboxFeature=true   # quota nhẹ
limits:
  maxRooms=100, maxUsers=30
price:
  monthly=1490000, yearly=14900000
```

### AI Pro
```text
features: (+ so với Tăng Trưởng)
  electric_management, visa_payment, company_management, user_management
flags:
  aiChatboxFeature=true
  electricManagementFeature=true
  paypalPaymentFeature=true
  # OpenClaw bật kèm hạ tầng AI (cấu hình gateway / pairing)
limits:
  maxRooms=200, maxUsers=50
price:
  monthly=2990000, yearly=29900000
```

### Enterprise
```text
isContactOnly=true
maxRooms=0 (unlimited), maxUsers=0 (unlimited)
# + thỏa thuận maxHotels phía Business plan
```

---

## 7. Add-on bán kèm (upsell linh hoạt)

| Add-on | Giá gợi ý / tháng | Gắn với |
|--------|-------------------|---------|
| Thêm 10 phòng | +99.000đ | Mọi gói trả phí |
| Thêm 5 user | +79.000đ | Mọi gói trả phí |
| Kênh Zalo OA (nếu chưa có) | +199.000đ | Từ Vận Hành |
| Kênh Fanpage | +199.000đ | Từ Vận Hành |
| OTA pack | +299.000đ | Từ Vận Hành |
| OpenClaw / AI nâng cao | +690.000đ | Từ Tăng Trưởng |
| Tuya điện phòng | +149.000đ + thiết bị | Từ Tăng Trưởng |
| Hạn mức HĐĐT thêm | Theo số lượng | SePay / e-invoice quota |
| Onsite training ½ ngày | 2.500.000đ / lần | Một lần |

---

## 8. Lộ trình nâng cấp (để CSKH / sales dùng)

```text
Dùng Thử
   ↓ hết hạn / >8 phòng
Khởi Đầu          ← homestay ổn định
   ↓ cần giao ca + báo cáo tiền
Vận Hành          ← sweet spot KS nhỏ
   ↓ bán OTA / chat MXH nhiều
Tăng Trưởng       ← bot chốt đơn + OTA
   ↓ muốn AI điều hành + OpenClaw
AI Pro
   ↓ đa cơ sở / SLA
Enterprise
```

**Không cho hạ cấp trước hết hạn** (đã có logic no-downgrade trên hệ thống) — giữ doanh thu MRR.

---

## 9. Thông điệp theo persona Việt Nam

| Persona | Nói gì |
|---------|--------|
| Chủ nhà nghỉ | “Check-in CCCD, tính giờ tự động, nhận QR — không cần thuê thêm người.” |
| Quản lý KS 30–60 phòng | “Giao ca rõ tiền, báo cáo ngày, app cho lễ tân.” |
| Sale / marketing | “Bot Zalo tư vấn đúng loại phòng, dẫn cọc SePay, tự giữ phòng.” |
| Chủ chuỗi | “Một OpenClaw hỏi được nhiều cơ sở, phân quyền theo role.” |
| Kế toán | “Thu–chi, HĐĐT, đối soát chuyển khoản trong một chỗ.” |

---

## 10. KPI thành công gói (nội bộ)

| Chỉ số | Mục tiêu gợi ý |
|--------|----------------|
| Tỷ lệ Dùng Thử → trả phí (30 ngày) | ≥ 25% |
| Gói phổ biến nhất | Vận Hành ≥ 40% paid |
| Attach rate kênh MXH (Tăng Trưởng+) | ≥ 60% |
| Attach rate AI/OpenClaw (AI Pro) | ≥ 70% gói AI Pro dùng OpenClaw trong 14 ngày |
| Churn tháng | < 4% SME |

---

## 11. Checklist đưa lên production

- [ ] Tạo 6 PricingPackage trên Admin đúng `features` / flags / limits ở mục 6  
- [ ] Landing `/pricing` hiển thị tên + giá + CTA “Liên hệ” cho Enterprise  
- [ ] Bật `aiChatboxFeature` + cấu hình OpenClaw gateway cho AI Pro / Enterprise  
- [ ] Bật `zalo_messages` / `fanpage_messages` / `telegram_messages` từ Tăng Trưởng  
- [ ] Đồng bộ copy bán hàng app PMS + web (i18n `PRICING_*`)  
- [ ] Tài liệu onboarding 1 trang cho từng gói (PDF / Notion)

---

## 12. Tóm tắt định giá nhanh (để in slide)

| Gói | Giá/tháng | Điểm nhấn |
|-----|-----------|-----------|
| Dùng Thử | 0đ | Trải nghiệm 8 phòng |
| Khởi Đầu | 299k | Homestay + OCR + QR |
| Vận Hành | 699k | Giao ca + tài chính |
| Tăng Trưởng | 1.49tr | OTA + bot Zalo/FB/TG |
| AI Pro | 2.99tr | AI Agent + OpenClaw |
| Enterprise | Liên hệ | Chuỗi + SLA |

---

*Tài liệu nội bộ PHHotel — căn cứ codebase: `pricingPackage`, permission features, PHGroup-AI channel sales, OpenClaw gateway. Có thể chỉnh giá theo chiến dịch vùng miền mà không đổi cấu trúc feature.*
