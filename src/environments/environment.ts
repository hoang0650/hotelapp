export const environment = {
  production: false,
  apiUrl: 'https://nest-production-8106.up.railway.app',
  paypalClientId: 'ATBqkyseKk-hdJulcm-AHEqlrtkvNBrVXm2_RlmtqCSdiS2B-MbuVom1yQEUDDT6xISfWyB1FJR_yiQp', // Thay bằng PayPal Client ID thực tế từ PayPal Developer Dashboard
  sepay: {
    sandbox: true, // Sử dụng sandbox cho testing, đổi thành false cho production
    // Merchant ID và Secret Key sẽ được lưu ở backend để bảo mật
  }
}; 