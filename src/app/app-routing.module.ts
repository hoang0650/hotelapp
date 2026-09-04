import { NgModule } from '@angular/core';
import { RouterModule, Routes, UrlMatchResult, UrlSegment } from '@angular/router';

// Các Import Component
import { LoginComponent } from './components/login/login.component';
import { HomeComponent } from './components/home/home.component';
import { SignupComponent } from './components/signup/signup.component';
import { ProductDetailComponent } from './components/product-detail/product-detail.component';
import { AdminComponent } from './components/admin/admin.component';
import { ModalComponent } from './components/modal/modal.component';
import { UnauthorizedComponent } from './components/unauthorized/unauthorized.component';
import { NotfoundComponent } from './components/notfound/notfound.component';
import { InvoiceComponent } from './components/invoice/invoice.component';
import { RoomHistoryComponent } from './components/room-history/room-history.component';
import { RoomComponent } from './components/room/room.component';
import { CompanyManagementComponent } from './components/company-management/company-management.component';
import { HotelManagementComponent } from './components/hotel-management/hotel-management.component';
import { RoomManagementComponent } from './components/room-management/room-management.component';
import { RoomCategoryPageComponent } from './components/room-category/room-category-page.component';
import { FloorPlanPageComponent } from './components/floor-plan/floor-plan-page.component';
import { StaffManagementComponent } from './components/staff-management/staff-management.component';
import { RevenueChartComponent } from './components/revenue-chart/revenue-chart.component';
import { VisaPaymentComponent } from './components/visa-payment/visa-payment.component';
import { QrPaymentComponent } from './components/qr-payment/qr-payment.component';
import { CalendarComponent } from './components/calendar/calendar.component';
import { EmailComposeComponent } from './components/email-compose/email-compose.component';
import { EmailListComponent } from './components/email-list/email-list.component';
import { EmailAdminComponent } from './components/email-admin/email-admin.component';
import { AboutUsComponent } from './components/about-us/about-us.component';
import { DunsComponent } from './components/duns/duns.component';
import { ChatComponent } from './components/chat/chat.component';
import { BusinessSignupComponent } from './components/business-signup/business-signup.component';
import { ServiceManagementComponent } from './components/service-management/service-management.component';
import { GuestManagementComponent } from './components/guest-management/guest-management.component';
import { UserManagementComponent } from './components/user-management/user-management.component';
import { BankTransferHistoryComponent } from './components/bank-transfer-history/bank-transfer-history.component';
import { PricingComponent } from './components/pricing/pricing.component';
import { PricingManagementComponent } from './components/pricing-management/pricing-management.component';
import { OtaManagementComponent } from './components/ota-management/ota-management.component';
import { TuyaSwitchComponent } from './components/tuya-switch/tuya-switch.component';
import { SepayOAuth2CallbackComponent } from './components/sepay-oauth2-callback/sepay-oauth2-callback.component';
import { ProfileComponent } from './components/profile/profile.component';
import { PermissionGuard } from './guards/permission.guard';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { SettingsComponent } from './components/settings/settings.component';
import { MaintenanceComponent } from './components/maintenance/maintenance.component';
import { PrivacyPolicyComponent } from './components/privacy-policy/privacy-policy.component';
import { TermsOfServiceComponent } from './components/terms-of-service/terms-of-service.component';
import { DeleteAccountComponent } from './components/delete-account/delete-account.component';
import { ClipLandingComponent } from './components/clip-landing/clip-landing.component';
import { ShiftHandoverHistoryComponent } from './components/shift-handover-history/shift-handover-history.component';
import { DebtManagementComponent } from './components/debt-management/debt-management.component';
import { BlogManagementComponent } from './components/blog-management/blog-management.component';
import { BlogComponent } from './components/blog/blog.component';
import { FinancialSummaryReportComponent } from './components/financial-summary-report/financial-summary-report.component';
import { ContactComponent } from './components/contact/contact.component';
import { ContactManagementComponent } from './components/contact-management/contact-management.component';
import { EInvoiceRegistrationComponent } from './components/e-invoice-registration/e-invoice-registration.component';
import { EInvoiceManagementComponent } from './components/e-invoice-management/e-invoice-management.component';
import { EInvoiceTemplateComponent } from './components/e-invoice-template/e-invoice-template.component';
import { HotelFilesComponent } from './components/hotel-files/hotel-files.component';
import { FanpageMessagesComponent } from './components/fanpage-messages/fanpage-messages.component';
import { ZaloMessagesComponent } from './components/zalo-messages/zalo-messages.component';
import { TelegramMessagesComponent } from './components/telegram-messages/telegram-messages.component';
import { BotSettingComponent } from './components/bot-setting/bot-setting.component';
import { CameraConfigComponent } from './components/camera-config/camera-config.component';
import { FileExportComponent } from './components/file-export/file-export.component';
import { AiUsageComponent } from './components/ai-usage/ai-usage.component';
import { SubdomainGuard } from './guards/subdomain.guard';

// 1. Khai báo danh sách các path hợp lệ của Admin
const adminSubdomainPaths = new Set([
  'room',
  'bill',
  'calendar',
  'email-admin',
  'qr-payment',
  'visa-payment',
  'company',
  'room-management',
  'room-category',
  'floor-plan',
  'service-management',
  'guest-management',
  'debt-management',
  'blog-management',
  'pricing-management',
  'ai-usage',
  'camera-config',
  'files',
  'exports', // <-- Đã thêm exports
  'users-management',
  'hotel',
  'staff',
  'chart',
  'unauthorized',
  'notfound',
  'shift-handover',
  'shift-handover-history',
  'bank-transfer-history',
  'financial-summary-report',
  'ota-management',
  'fanpage-messages',
  'zalo-messages',
  'telegram-messages',
  'bot-setting',
  'electric-setting',
  'profile',
  'settings',
  'contact-management',
  'e-invoice-management',
  'e-invoice-template',
  'e-invoice-registration'
]);

// 2. Logic kiểm tra Subdomain
const adminSubdomainMatcher = (segments: UrlSegment[]): UrlMatchResult | null => {
  const isBrowser = typeof window !== 'undefined';
  const isAdminSubdomain = isBrowser && window.location.hostname.startsWith('admin.');

  if (!isAdminSubdomain) return null;

  // Nếu người dùng vào thẳng admin.phhotel.vn/ (Độ dài URL = 0)
  if (segments.length === 0) return { consumed: [] };

  // Khớp chính xác các path của Admin
  if (adminSubdomainPaths.has(segments[0].path)) {
    return { consumed: [] };
  }

  return null;
};

// 3. MẢNG ROUTES (Đã sắp xếp lại thứ tự từ trên xuống dưới)
const routes: Routes = [
  
  // KHỐI 1: CÁC TRANG CÔNG CỘNG (Luôn bắt dính trước tiên)
  { path: 'login', component: LoginComponent, canActivate: [SubdomainGuard], data: { titleKey: 'SEO.LOGIN.TITLE', robots: 'noindex,nofollow' } },
  { path: 'signup', component: SignupComponent, canActivate: [SubdomainGuard], data: { titleKey: 'SEO.SIGNUP.TITLE', robots: 'noindex,nofollow' } },
  { path: 'business-signup', component: BusinessSignupComponent, canActivate: [SubdomainGuard], data: { titleKey: 'SEO.BUSINESS_SIGNUP.TITLE', robots: 'noindex,nofollow' } },
  { path: 'forgot-password', component: ForgotPasswordComponent, canActivate: [SubdomainGuard], data: { titleKey: 'SEO.FORGOT_PASSWORD.TITLE', robots: 'noindex,nofollow' } },
  { path: 'reset-password/:token', component: ResetPasswordComponent, canActivate: [SubdomainGuard], data: { titleKey: 'SEO.RESET_PASSWORD.TITLE', robots: 'noindex,nofollow' } },
  { path: 'unauthorized', component: UnauthorizedComponent, canActivate: [SubdomainGuard] },
  { path: 'notfound', component: NotfoundComponent },
  
  // (Cho phép tải/xem trước file ở giao diện tràn viền toàn màn hình)
  { path: 'exports/:filename', component: FileExportComponent },

  // KHỐI 2: DÀNH CHO SUBDOMAIN ADMIN (admin.phhotel.vn)
  {
    matcher: adminSubdomainMatcher,
    component: AdminComponent,
    data: { robots: 'noindex,nofollow', titleKey: 'SEO.ADMIN.TITLE' },
    children: [
      { path: '', redirectTo: 'room', pathMatch: 'full' },
      { path: 'room', component: RoomComponent, canActivate: [PermissionGuard] },
      { path: 'bill', component: InvoiceComponent },
      { path: 'calendar', component: CalendarComponent, canActivate: [PermissionGuard] },
      { path: 'email-admin', component: EmailAdminComponent, canActivate: [PermissionGuard] },
      { path: 'qr-payment', component: QrPaymentComponent, canActivate: [PermissionGuard] },
      { path: 'visa-payment', component: VisaPaymentComponent, canActivate: [PermissionGuard] },
      { path: 'company', component: CompanyManagementComponent, canActivate: [PermissionGuard] },
      { path: 'room-management', component: RoomManagementComponent, canActivate: [PermissionGuard] },
      { path: 'room-category', component: RoomCategoryPageComponent, canActivate: [PermissionGuard] },
      { path: 'floor-plan', component: FloorPlanPageComponent, canActivate: [PermissionGuard] },
      { path: 'service-management', component: ServiceManagementComponent, canActivate: [PermissionGuard] },
      { path: 'guest-management', component: GuestManagementComponent, canActivate: [PermissionGuard] },
      { path: 'debt-management', component: DebtManagementComponent, canActivate: [PermissionGuard] },
      { path: 'blog-management', component: BlogManagementComponent, canActivate: [PermissionGuard] },
      { path: 'pricing-management', component: PricingManagementComponent, canActivate: [PermissionGuard] },
      { path: 'ai-usage', component: AiUsageComponent, canActivate: [PermissionGuard] },
      { path: 'camera-config', component: CameraConfigComponent, canActivate: [PermissionGuard] },
      { path: 'exports/:filename', component: FileExportComponent }, // <-- Thêm vào children của Admin
      { path: 'files', component: HotelFilesComponent, canActivate: [PermissionGuard] },
      { path: 'users-management', component: UserManagementComponent, canActivate: [PermissionGuard] },
      { path: 'hotel', component: HotelManagementComponent, canActivate: [PermissionGuard] },
      { path: 'staff', component: StaffManagementComponent, canActivate: [PermissionGuard] },
      { path: 'chart', component: RevenueChartComponent, canActivate: [PermissionGuard] },
      { path: 'unauthorized', component: UnauthorizedComponent },
      { path: 'notfound', component: NotfoundComponent },
      { path: 'shift-handover', component: RoomHistoryComponent, canActivate: [PermissionGuard] },
      { path: 'shift-handover-history', component: ShiftHandoverHistoryComponent, canActivate: [PermissionGuard] },
      { path: 'bank-transfer-history', component: BankTransferHistoryComponent, canActivate: [PermissionGuard] },
      { path: 'financial-summary-report', component: FinancialSummaryReportComponent, canActivate: [PermissionGuard] },
      { path: 'ota-management', component: OtaManagementComponent, canActivate: [PermissionGuard] },
      { path: 'fanpage-messages', component: FanpageMessagesComponent, canActivate: [PermissionGuard] },
      { path: 'zalo-messages', component: ZaloMessagesComponent, canActivate: [PermissionGuard] },
      { path: 'telegram-messages', component: TelegramMessagesComponent, canActivate: [PermissionGuard] },
      { path: 'bot-setting', component: BotSettingComponent, canActivate: [PermissionGuard] },
      { path: 'electric-setting', component: TuyaSwitchComponent, canActivate: [PermissionGuard] },
      { path: 'profile', component: ProfileComponent, canActivate: [PermissionGuard] },
      { path: 'settings', component: SettingsComponent, canActivate: [PermissionGuard] },
      { path: 'contact-management', component: ContactManagementComponent, canActivate: [PermissionGuard] },
      { path: 'e-invoice-management', component: EInvoiceManagementComponent, canActivate: [PermissionGuard] },
      { path: 'e-invoice-template', component: EInvoiceTemplateComponent, canActivate: [PermissionGuard] },
      { path: 'e-invoice-registration', component: EInvoiceRegistrationComponent, canActivate: [PermissionGuard] }
    ]
  },

  // KHỐI 3: DÀNH CHO DOMAIN CHÍNH (phhotel.vn/admin)
  {
    path: 'admin', component: AdminComponent, data: { robots: 'noindex,nofollow', titleKey: 'SEO.ADMIN.TITLE' }, children: [
      { path: '', redirectTo: 'room', pathMatch: 'full' },
      { path: 'room', component: RoomComponent, canActivate: [PermissionGuard] },
      { path: 'bill', component: InvoiceComponent },
      { path: 'calendar', component: CalendarComponent, canActivate: [PermissionGuard] },
      { path: 'email-admin', component: EmailAdminComponent, canActivate: [PermissionGuard] },
      { path: 'qr-payment', component: QrPaymentComponent, canActivate: [PermissionGuard] },
      { path: 'visa-payment', component: VisaPaymentComponent, canActivate: [PermissionGuard] },
      { path: 'company', component: CompanyManagementComponent, canActivate: [PermissionGuard] },
      { path: 'room-management', component: RoomManagementComponent, canActivate: [PermissionGuard] },
      { path: 'room-category', component: RoomCategoryPageComponent, canActivate: [PermissionGuard] },
      { path: 'floor-plan', component: FloorPlanPageComponent, canActivate: [PermissionGuard] },
      { path: 'service-management', component: ServiceManagementComponent, canActivate: [PermissionGuard] },
      { path: 'guest-management', component: GuestManagementComponent, canActivate: [PermissionGuard] },
      { path: 'debt-management', component: DebtManagementComponent, canActivate: [PermissionGuard] },
      { path: 'blog-management', component: BlogManagementComponent, canActivate: [PermissionGuard] },
      { path: 'pricing-management', component: PricingManagementComponent, canActivate: [PermissionGuard] },
      { path: 'ai-usage', component: AiUsageComponent, canActivate: [PermissionGuard] },
      { path: 'camera-config', component: CameraConfigComponent, canActivate: [PermissionGuard] },
      { path: 'exports/:filename', component: FileExportComponent }, // <-- Thêm vào children của Admin
      { path: 'files/:filename', component: FileExportComponent, canActivate: [PermissionGuard] },
      { path: 'files', component: HotelFilesComponent, canActivate: [PermissionGuard] },
      { path: 'users-management', component: UserManagementComponent, canActivate: [PermissionGuard] },
      { path: 'hotel', component: HotelManagementComponent, canActivate: [PermissionGuard] },
      { path: 'staff', component: StaffManagementComponent, canActivate: [PermissionGuard] },
      { path: 'chart', component: RevenueChartComponent, canActivate: [PermissionGuard] },
      { path: 'unauthorized', component: UnauthorizedComponent },
      { path: 'notfound', component: NotfoundComponent },
      { path: 'shift-handover', component: RoomHistoryComponent, canActivate: [PermissionGuard] },
      { path: 'shift-handover-history', component: ShiftHandoverHistoryComponent, canActivate: [PermissionGuard] },
      { path: 'bank-transfer-history', component: BankTransferHistoryComponent, canActivate: [PermissionGuard] },
      { path: 'financial-summary-report', component: FinancialSummaryReportComponent, canActivate: [PermissionGuard] },
      { path: 'ota-management', component: OtaManagementComponent, canActivate: [PermissionGuard] },
      { path: 'fanpage-messages', component: FanpageMessagesComponent, canActivate: [PermissionGuard] },
      { path: 'zalo-messages', component: ZaloMessagesComponent, canActivate: [PermissionGuard] },
      { path: 'telegram-messages', component: TelegramMessagesComponent, canActivate: [PermissionGuard] },
      { path: 'bot-setting', component: BotSettingComponent, canActivate: [PermissionGuard] },
      { path: 'electric-setting', component: TuyaSwitchComponent, canActivate: [PermissionGuard] },
      { path: 'profile', component: ProfileComponent, canActivate: [PermissionGuard] },
      { path: 'settings', component: SettingsComponent, canActivate: [PermissionGuard] },
      { path: 'contact-management', component: ContactManagementComponent, canActivate: [PermissionGuard] },
      { path: 'e-invoice-management', component: EInvoiceManagementComponent, canActivate: [PermissionGuard] },
      { path: 'e-invoice-template', component: EInvoiceTemplateComponent, canActivate: [PermissionGuard] },
      { path: 'e-invoice-registration', component: EInvoiceRegistrationComponent, canActivate: [PermissionGuard] }
    ]
  },

  // KHỐI 4: CÁC TRANG NGOÀI (Dành cho domain chính)
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent, data: { titleKey: 'SEO.HOME.TITLE', descriptionKey: 'SEO.HOME.DESCRIPTION' } },
  { path: 'pricing', component: PricingComponent, data: { titleKey: 'SEO.PRICING.TITLE', descriptionKey: 'SEO.PRICING.DESCRIPTION' } },
  { path: 'blog', component: BlogComponent, data: { titleKey: 'SEO.BLOG.TITLE', descriptionKey: 'SEO.BLOG.DESCRIPTION' } },
  { path: 'blog/:id', component: BlogComponent, data: { titleKey: 'SEO.BLOG_DETAIL.TITLE', robots: 'index,follow' } },
  { path: 'contact', component: ContactComponent, data: { titleKey: 'SEO.CONTACT.TITLE', descriptionKey: 'SEO.CONTACT.DESCRIPTION' } },
  { path: 'maintenance', component: MaintenanceComponent, data: { titleKey: 'SEO.MAINTENANCE.TITLE', robots: 'noindex,nofollow' } },
  { path: 'room/:id', component: ProductDetailComponent },
  { path: 'modal', component: ModalComponent },
  { path: 'email-list', component: EmailListComponent },
  { path: 'email-compose', component: EmailComposeComponent },
  { path: 'hotel-files', component: HotelFilesComponent },
  { path: 'about-us', component: AboutUsComponent, data: { titleKey: 'SEO.ABOUT_US.TITLE', descriptionKey: 'SEO.ABOUT_US.DESCRIPTION' } },
  { path: 'duns', component: DunsComponent, data: { titleKey: 'SEO.DUNS.TITLE', descriptionKey: 'SEO.DUNS.DESCRIPTION' } },
  { path: 'chat', component: ChatComponent },
  { path: 'qr-payment', component: QrPaymentComponent, canActivate: [PermissionGuard] },
  { path: 'visa-payment', component: VisaPaymentComponent, canActivate: [PermissionGuard] },
  { path: 'sepay-oauth2-callback', component: SepayOAuth2CallbackComponent },
  { path: 'privacy-policy', component: PrivacyPolicyComponent, data: { titleKey: 'SEO.PRIVACY_POLICY.TITLE', descriptionKey: 'SEO.PRIVACY_POLICY.DESCRIPTION' } },
  { path: 'terms-of-service', component: TermsOfServiceComponent, data: { titleKey: 'SEO.TERMS_OF_SERVICE.TITLE', descriptionKey: 'SEO.TERMS_OF_SERVICE.DESCRIPTION' } },
  { path: 'delete-account', component: DeleteAccountComponent, data: { titleKey: 'SEO.DELETE_ACCOUNT.TITLE', descriptionKey: 'SEO.DELETE_ACCOUNT.DESCRIPTION', robots: 'index,follow' } },
  { path: 'clip', component: ClipLandingComponent, data: { titleKey: 'SEO.CLIP.TITLE', descriptionKey: 'SEO.CLIP.DESCRIPTION', robots: 'index,follow' } },

  // KHỐI 5: LUÔN NẰM CUỐI CÙNG LÀ ROUTE BÁO LỖI
  { path: '**', component: NotfoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }