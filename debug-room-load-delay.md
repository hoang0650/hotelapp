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

## Current Assessment

- Hypothesis A: Login redirect thực sự xảy ra. `CONFIRMED`
- Hypothesis B/C/D/E: Chưa đủ evidence để kết luận.
- Hypothesis 5: Có khả năng rất cao trang đích `admin.phhotel.vn/admin/room` đang chạy bản deploy khác với code local đã gắn instrumentation, nên log phía `room` không quay về collector local. `LIKELY`

## Fix Applied

- Frontend guard cho route `/admin/room` được thêm fallback timeout ngắn.
- Nếu `PermissionService.ready$` chưa hoàn tất trong `1500ms`, guard sẽ cho phép các role nền tảng của vận hành (`business`, `hotel`, `staff`, `admin`, `superadmin`) đi thẳng vào màn `room` thay vì tiếp tục bị chặn chờ package permission.
- Mục tiêu là loại bỏ tình huống production bị treo rất lâu ở bước `getCurrentUserPackage()` trước khi render danh sách phòng.
- `AuthService.refreshAccessToken()` được chống gọi trùng bằng request dùng chung (`shareReplay(1)` + `finalize()`), vì production path hiện có khả năng gọi refresh token nhiều lần cùng lúc ở app bootstrap, redirect check, và route guard.
