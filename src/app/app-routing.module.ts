import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
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
const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent, data: { titleKey: 'SEO.HOME.TITLE', descriptionKey: 'SEO.HOME.DESCRIPTION' } },
  { path: 'pricing', component: PricingComponent, data: { titleKey: 'SEO.PRICING.TITLE', descriptionKey: 'SEO.PRICING.DESCRIPTION' } },
  { path: 'blog', component: BlogComponent, data: { titleKey: 'SEO.BLOG.TITLE', descriptionKey: 'SEO.BLOG.DESCRIPTION' } },
  { path: 'blog/:id', component: BlogComponent, data: { titleKey: 'SEO.BLOG_DETAIL.TITLE', robots: 'index,follow' } },
  { path: 'contact', component: ContactComponent, data: { titleKey: 'SEO.CONTACT.TITLE', descriptionKey: 'SEO.CONTACT.DESCRIPTION' } },
  { path: 'login', component: LoginComponent, data: { titleKey: 'SEO.LOGIN.TITLE', robots: 'noindex,nofollow' } },
  { path: 'signup', component: SignupComponent, data: { titleKey: 'SEO.SIGNUP.TITLE', robots: 'noindex,nofollow' } },
  { path: 'business-signup', component: BusinessSignupComponent, data: { titleKey: 'SEO.BUSINESS_SIGNUP.TITLE', robots: 'noindex,nofollow' } },
  { path: 'forgot-password', component: ForgotPasswordComponent, data: { titleKey: 'SEO.FORGOT_PASSWORD.TITLE', robots: 'noindex,nofollow' } },
  { path: 'reset-password/:token', component: ResetPasswordComponent, data: { titleKey: 'SEO.RESET_PASSWORD.TITLE', robots: 'noindex,nofollow' } },
  { path: 'maintenance', component: MaintenanceComponent, data: { titleKey: 'SEO.MAINTENANCE.TITLE', robots: 'noindex,nofollow' } },
  { path: 'room/:id', component: ProductDetailComponent },
  {
    path: 'admin', component: AdminComponent, data: { robots: 'noindex,nofollow', titleKey: 'SEO.ADMIN.TITLE' }, children: [
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
      { path: 'camera-config', component: CameraConfigComponent, canActivate: [PermissionGuard] },
      { path: 'files', component: HotelFilesComponent, canActivate: [PermissionGuard] },
      {
        path: 'users-management',
        component: UserManagementComponent,
        canActivate: [PermissionGuard]
      },
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
      { path: 'e-invoice-registration', component: EInvoiceRegistrationComponent, canActivate: [PermissionGuard] },
      // Thêm các route con khác nếu cần
    ]
  },
  // Subdomain routes (same components but without 'admin' prefix)
  {
    path: '', component: AdminComponent, data: { robots: 'noindex,nofollow', titleKey: 'SEO.ADMIN.TITLE' }, children: [
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
      { path: 'camera-config', component: CameraConfigComponent, canActivate: [PermissionGuard] },
      { path: 'files', component: HotelFilesComponent, canActivate: [PermissionGuard] },
      {
        path: 'users-management',
        component: UserManagementComponent,
        canActivate: [PermissionGuard]
      },
      { path: 'hotel', component: HotelManagementComponent, canActivate: [PermissionGuard] },
      { path: 'staff', component: StaffManagementComponent, canActivate: [PermissionGuard] },
      { path: 'chart', component: RevenueChartComponent, canActivate: [PermissionGuard] },
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
      { path: 'e-invoice-registration', component: EInvoiceRegistrationComponent, canActivate: [PermissionGuard] },
    ]
  },
  { path: 'modal', component: ModalComponent },
  { path: 'unauthorized', component: UnauthorizedComponent },
  { path: 'notfound', component: NotfoundComponent },
  { path: 'bill', component: InvoiceComponent },
  { path: 'email-list', component: EmailListComponent },
  { path: 'email-compose', component: EmailComposeComponent },
  { path: 'hotel-files', component: HotelFilesComponent },
  { path: 'about-us', component: AboutUsComponent, data: { titleKey: 'SEO.ABOUT_US.TITLE', descriptionKey: 'SEO.ABOUT_US.DESCRIPTION' } },
  { path: 'chat', component: ChatComponent },
  { path: 'qr-payment', component: QrPaymentComponent, canActivate: [PermissionGuard] },
  { path: 'visa-payment', component: VisaPaymentComponent, canActivate: [PermissionGuard] },
  { path: 'sepay-oauth2-callback', component: SepayOAuth2CallbackComponent },
  { path: 'privacy-policy', component: PrivacyPolicyComponent, data: { titleKey: 'SEO.PRIVACY_POLICY.TITLE', descriptionKey: 'SEO.PRIVACY_POLICY.DESCRIPTION' } },
  { path: 'terms-of-service', component: TermsOfServiceComponent, data: { titleKey: 'SEO.TERMS_OF_SERVICE.TITLE', descriptionKey: 'SEO.TERMS_OF_SERVICE.DESCRIPTION' } },

];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
