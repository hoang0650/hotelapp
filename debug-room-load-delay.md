# Debug Session: room-load-delay

- Status: OPEN
- Symptom: Sau khi đăng nhập thành công, mất khoảng 55 giây mới thấy danh sách phòng.
- Goal: Giảm thời gian hiển thị danh sách phòng đầu tiên xuống khoảng 3-10 giây.
- Scope: `src/app/components/room/`, luồng sau login đi vào `/admin/room`.

## Hypotheses

1. Luồng khởi tạo sau login đang gọi nhiều request nối tiếp hoặc trùng lặp nên tổng thời gian bị cộng dồn.
2. API `getSelectedHotel`, `getHotels`, `getRooms`, hoặc `getHotelFloors` có một request rất chậm và chặn màn hình.
3. Component `room` render quá nặng do template gọi nhiều hàm tính toán lặp lại trên mỗi card phòng.
4. Có polling, socket, hoặc load thêm events/price cho phòng occupied làm nghẽn lần render đầu.
5. Độ trễ thực tế nằm trước khi vào `RoomComponent`, ví dụ ở login redirect hoặc app bootstrap route.

## Plan

1. Thêm instrumentation log đo thời gian vào login redirect và room bootstrap.
2. Reproduce và thu log thực tế.
3. Chốt giả thuyết đúng bằng evidence.
4. Áp dụng fix tối thiểu theo đúng điểm nghẽn.
5. So sánh pre-fix và post-fix.

## Evidence

- `pre-fix` log hiện chỉ có:
  - `A / login.component.ts:executeFastRedirect`
  - `msg=[DEBUG] login redirect started`
- Chưa có log từ `PermissionGuard` hoặc `RoomComponent`.
- Browser console trên production cho thấy nhiều request chạy trước khi auth sẵn sàng:
  - `GET /ai-assistant/history` -> `401`
  - `GET /api/settings/announcements` -> `401`
  - `GET /api/settings/notification` -> `401`
  - `GET /api/settings/announcements/unread-count` -> `401`
  - `GET /rooms` -> `400`
- Network trace mới cho thấy `loadHotels()` và đặc biệt `getHotelFloors()` đang nằm trên critical path; `getHotelFloors` có lúc mất ~`28s`.

## Current Assessment

- Hypothesis A: Login redirect thực sự xảy ra. `CONFIRMED`
- Hypothesis B/C/D/E: Chưa đủ evidence để kết luận.
- Hypothesis 5: Có khả năng rất cao trang đích `admin.phhotel.vn/admin/room` đang chạy bản deploy khác với code local đã gắn instrumentation, nên log phía `room` không quay về collector local. `LIKELY`
- Hypothesis 1: App bootstrap đang bắn nhiều request trước khi phiên đăng nhập sẵn sàng. `CONFIRMED`

## Fix Applied

- Frontend guard cho route `/admin/room` được thêm fallback timeout ngắn.
- Nếu `PermissionService.ready$` chưa hoàn tất trong `1500ms`, guard sẽ cho phép các role nền tảng của vận hành (`business`, `hotel`, `staff`, `admin`, `superadmin`) đi thẳng vào màn `room` thay vì tiếp tục bị chặn chờ package permission.
- Mục tiêu là loại bỏ tình huống production bị treo rất lâu ở bước `getCurrentUserPackage()` trước khi render danh sách phòng.
- `AuthService.refreshAccessToken()` được chống gọi trùng bằng request dùng chung (`shareReplay(1)` + `finalize()`), vì production path hiện có khả năng gọi refresh token nhiều lần cùng lúc ở app bootstrap, redirect check, và route guard.
- `NotificationsService` không còn tự load announcements trong constructor, đồng thời trả fallback rỗng nếu chưa có user/token.
- `HeaderComponent` chỉ load notification settings và announcements sau khi đã có phiên hợp lệ, đồng thời không còn dựng interval refresh trước login.
- `AiAssistantService` không còn tự `loadChatHistory()` trong constructor; `app-ai-chatbox` chỉ mount sau khi có user và chỉ load history khi auth đã sẵn sàng.
- `ProductService` không còn tự gọi `GET /rooms` không có `hotelId` trong constructor.
- `RoomComponent` ưu tiên render `rooms` trước; nếu đã có `selectedHotelId` thì `loadHotels()` được dời xuống sau render đầu, còn `getHotelFloors()` chỉ chạy nền để đồng bộ thêm, không chặn lần hiển thị đầu tiên.
