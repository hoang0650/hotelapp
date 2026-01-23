# Hotel

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 17.3.8.

## Tổng quan dự án
- Frontend: Angular 17
- Backend: Nest (Express) tại thư mục `nest/backend`
- AI Service: FastAPI tại thư mục `PHGroup-AI` (OCR CCCD, embedding, Fanpage)
- Triển khai i18n, guard và phân quyền theo vai trò

## Luồng Auth an toàn XSS
- Access Token: lưu trong bộ nhớ (in-memory) của `AuthService` (không dùng localStorage/sessionStorage)
- Refresh Token: lưu trong HttpOnly Cookie (SameSite=strict, Secure khi production) do backend set ở đường dẫn `/users`
- Tự động refresh: Interceptor bắt 401, gọi `POST /users/refresh-token` với `withCredentials: true` và retry request
- Đăng xuất: `POST /users/logout` để xoá cookie refresh và xoá token trong memory

### Endpoints liên quan
- `POST /users/login` → trả access token và set refresh cookie
- `POST /users/refresh-token` → dùng refresh cookie để cấp access token mới
- `POST /users/logout` → xoá refresh cookie

### Lưu ý cấu hình
- Bật `withCredentials: true` cho các request liên quan refresh
- Backend bật CORS với `credentials: true` và `origin` phù hợp (app.js)
- Không ghi log token, không lưu token vào localStorage/sessionStorage

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
