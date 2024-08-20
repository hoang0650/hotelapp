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
const routes: Routes = [
  { path: '', redirectTo: 'admin', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  { path: 'product/:id', component: ProductDetailComponent },
  {
    path: 'admin', component: AdminComponent, children: [
      { path: 'room', component: RoomComponent },
      { path: 'bill', component: InvoiceComponent },
      { path: 'calendar', component: CalendarComponent },
      { path: 'email-list', component: EmailListComponent },
      { path: 'email-compose', component: EmailComposeComponent },
      { path: 'email-admin', component: EmailAdminComponent },
      { path: 'qr-payment', component: QrPaymentComponent },
      { path: 'visa-payment', component: VisaPaymentComponent },
      { path: 'company', component: CompanyManagementComponent },
      { path: 'room-management', component: RoomManagementComponent },
      { path: 'hotel', component: HotelManagementComponent },
      { path: 'staff', component: StaffManagementComponent },
      { path: 'chart', component: RevenueChartComponent },
      { path: 'unauthorized', component: UnauthorizedComponent },
      { path: 'notfound', component: NotfoundComponent },
      // Thêm các route con khác nếu cần
    ]
  },
  { path: 'modal', component: ModalComponent },
  { path: 'unauthorized', component: UnauthorizedComponent },
  { path: 'notfound', component: NotfoundComponent },
  { path: 'bill', component: InvoiceComponent }

];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
