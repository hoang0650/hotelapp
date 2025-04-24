import { defineConfig } from 'vite';

export default defineConfig({
  // Cấu hình cơ bản cho Vite
  build: {
    // Ngăn chặn vấn đề cache trong quá trình build
    emptyOutDir: true
  },
  // Cấu hình server phát triển
  server: {
    hmr: {
      // Sử dụng WebSocket cho Hot Module Replacement
      protocol: 'ws'
    }
  },
  // Tùy chọn để khắc phục vấn đề về cache
  optimizeDeps: {
    // Đặt force: true để tái tạo cache mỗi khi khởi động
    force: true,
    // Bỏ qua một số gói có thể gây ra vấn đề
    exclude: ['fsevents']
  }
}); 