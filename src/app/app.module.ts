import { NgModule } from '@angular/core';
import { BrowserModule, provideClientHydration } from '@angular/platform-browser';
import { NgxEchartsModule } from 'ngx-echarts'; // Import NgxEchartsModule
import { HighchartsChartModule } from 'highcharts-angular';
import { DatePipe } from '@angular/common'; // Import DatePipe

import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HeaderComponent } from './components/header/header.component';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ProductListComponent } from './components/product-list/product-list.component';
import { LoginComponent } from './components/login/login.component';
import { HomeComponent } from './components/home/home.component';
import { SignupComponent } from './components/signup/signup.component';
import { ProductDetailComponent } from './components/product-detail/product-detail.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { AdminComponent } from './components/admin/admin.component';
import { RoomHistoryComponent } from './components/room-history/room-history.component';
import { RoomComponent } from './components/room/room.component';
import { ModalComponent } from './components/modal/modal.component';
import { TableComponent } from './components/table/table.component';

import { ModalControlDirective } from './directives/modal-control.directive';

import { NZ_I18N } from 'ng-zorro-antd/i18n';
import { en_US } from 'ng-zorro-antd/i18n';
import { vi_VN } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import en from '@angular/common/locales/en';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSliderModule } from 'ng-zorro-antd/slider';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzCarouselModule } from 'ng-zorro-antd/carousel';
import { NzDatePickerModule} from 'ng-zorro-antd/date-picker';
import { NzCalendarModule } from 'ng-zorro-antd/calendar';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzMessageModule } from 'ng-zorro-antd/message';
import { NzUploadModule } from 'ng-zorro-antd/upload';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzBadgeModule } from 'ng-zorro-antd/badge';

import { SortByCheckinTimePipe } from './pipes/sort-by-checkin-time.pipe';
import { FilterPipe } from './pipes/filter.pipe';
import { UnauthorizedComponent } from './components/unauthorized/unauthorized.component';
import { NotfoundComponent } from './components/notfound/notfound.component';
import { RoomContentModalComponent } from './components/room-content-modal/room-content-modal.component';
import { InvoiceComponent } from './components/invoice/invoice.component';
import { CompanyManagementComponent } from './components/company-management/company-management.component';
import { HotelManagementComponent } from './components/hotel-management/hotel-management.component';
import { RoomManagementComponent } from './components/room-management/room-management.component';
import { StaffManagementComponent } from './components/staff-management/staff-management.component';
import { RevenueChartComponent } from './components/revenue-chart/revenue-chart.component';
import { SortRoomsPipe } from './pipes/sort-rooms.pipe';
import { VisaPaymentComponent } from './components/visa-payment/visa-payment.component';
import { QrPaymentComponent } from './components/qr-payment/qr-payment.component';
import { CalendarComponent } from './components/calendar/calendar.component';
import { EmailComposeComponent } from './components/email-compose/email-compose.component';
import { EmailListComponent } from './components/email-list/email-list.component';
import { EmailAdminComponent } from './components/email-admin/email-admin.component';
import { CaliendarModalComponent } from './components/caliendar-modal/caliendar-modal.component';
import { CapitalizePipe } from './pipes/capitalize.pipe';
import { AboutUsComponent } from './components/about-us/about-us.component';
import { ChatComponent } from './components/chat/chat.component';
import { BusinessSignupComponent } from './components/business-signup/business-signup.component';
import { RoomServiceComponent } from './components/room-service/room-service.component';
import { ServiceManagementComponent } from './components/service-management/service-management.component';
import { InvoiceModalComponent } from './components/invoice-modal/invoice-modal.component';
import { UserManagementComponent } from './components/user-management/user-management.component';
import { UserFormModalComponent } from './components/user-management/user-form-modal/user-form-modal.component';

registerLocaleData(en);

@NgModule({ declarations: [
        AppComponent,
        HeaderComponent,
        ProductListComponent,
        LoginComponent,
        HomeComponent,
        SignupComponent,
        ProductDetailComponent,
        SidebarComponent,
        AdminComponent,
        RoomHistoryComponent,
        RoomComponent,
        ModalComponent,
        TableComponent,
        ModalControlDirective,
        SortByCheckinTimePipe,
        FilterPipe,
        UnauthorizedComponent,
        NotfoundComponent,
        RoomContentModalComponent,
        InvoiceComponent,
        CompanyManagementComponent,
        HotelManagementComponent,
        RoomManagementComponent,
        StaffManagementComponent,
        RevenueChartComponent,
        SortRoomsPipe,
        VisaPaymentComponent,
        QrPaymentComponent,
        CalendarComponent,
        EmailComposeComponent,
        EmailListComponent,
        EmailAdminComponent,
        CaliendarModalComponent,
        CapitalizePipe,
        AboutUsComponent,
        ChatComponent,
        BusinessSignupComponent,
        RoomServiceComponent,
        ServiceManagementComponent,
        InvoiceModalComponent,
        UserManagementComponent,
        UserFormModalComponent
    ],
    bootstrap: [AppComponent], imports: [BrowserModule,
        NgxEchartsModule.forRoot({ echarts: () => import('echarts') }),
        HighchartsChartModule,
        AppRoutingModule,
        FormsModule,
        ReactiveFormsModule,
        NzMenuModule,
        NzToolTipModule,
        NzButtonModule,
        NzIconModule,
        NzCollapseModule,
        NzLayoutModule,
        NzBreadCrumbModule,
        NzGridModule,
        NzSliderModule,
        NzSwitchModule,
        NzTableModule,
        NzRadioModule,
        NzDividerModule,
        NzFormModule,
        NzCardModule,
        NzModalModule,
        NzTabsModule,
        NzPopconfirmModule,
        NzSelectModule,
        NzInputModule,
        NzDropDownModule,
        NzCarouselModule,
        NzDatePickerModule,
        NzCalendarModule,
        NzTimelineModule,
        NzTagModule,
        NzAvatarModule,
        NzListModule,
        NzEmptyModule,
        NzSpinModule,
        NzInputNumberModule,
        NzDrawerModule,
        NzDescriptionsModule,
        NzMessageModule,
        NzUploadModule,
        NzAlertModule,
        NzCheckboxModule,
        NzStatisticModule,
        NzBadgeModule
    ], providers: [
        provideClientHydration(),
        { provide: NZ_I18N, useValue: en_US },
        provideAnimationsAsync(),
        provideHttpClient(),
        provideHttpClient(withInterceptorsFromDi()),
        DatePipe
    ] })
export class AppModule { }
