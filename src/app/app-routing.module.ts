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

const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'pricing', component: PricingComponent },
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  { path: 'business-signup', component: BusinessSignupComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password/:token', component: ResetPasswordComponent },
  { path: 'maintenance', component: MaintenanceComponent },
  { path: 'room/:id', component: ProductDetailComponent },
  {
    path: 'admin', component: AdminComponent, children: [
      { path: 'room', component: RoomComponent, canActivate: [PermissionGuard] },
      { path: 'bill', component: InvoiceComponent },
      { path: 'calendar', component: CalendarComponent, canActivate: [PermissionGuard] },
      { path: 'email-admin', component: EmailAdminComponent, canActivate: [PermissionGuard] },
      { path: 'qr-payment', component: QrPaymentComponent, canActivate: [PermissionGuard] },
      { path: 'visa-payment', component: VisaPaymentComponent, canActivate: [PermissionGuard] },
      { path: 'company', component: CompanyManagementComponent, canActivate: [PermissionGuard] },
      { path: 'room-management', component: RoomManagementComponent, canActivate: [PermissionGuard] },
      { path: 'service-management', component: ServiceManagementComponent, canActivate: [PermissionGuard] },
      { path: 'pricing-management', component: PricingManagementComponent, canActivate: [PermissionGuard] },
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
      { path: 'ota-management', component: OtaManagementComponent, canActivate: [PermissionGuard] },
      { path: 'electric-setting', component: TuyaSwitchComponent, canActivate: [PermissionGuard] },
      { path: 'profile', component: ProfileComponent, canActivate: [PermissionGuard] },
      { path: 'settings', component: SettingsComponent, canActivate: [PermissionGuard] },
      // Thêm các route con khác nếu cần
    ]
  },
  { path: 'modal', component: ModalComponent },
  { path: 'unauthorized', component: UnauthorizedComponent },
  { path: 'notfound', component: NotfoundComponent },
  { path: 'bill', component: InvoiceComponent },
  { path: 'email-list', component: EmailListComponent },
  { path: 'email-compose', component: EmailComposeComponent },
  { path: 'about-us', component: AboutUsComponent },
  { path: 'chat', component: ChatComponent },
  { path: 'qr-payment', component: QrPaymentComponent, canActivate: [PermissionGuard] },
  { path: 'visa-payment', component: VisaPaymentComponent, canActivate: [PermissionGuard] },
  { path: 'sepay-oauth2-callback', component: SepayOAuth2CallbackComponent },
  { path: 'privacy-policy', component: PrivacyPolicyComponent },
  { path: 'terms-of-service', component: TermsOfServiceComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
