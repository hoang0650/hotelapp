import { NgModule } from '@angular/core';
import { BrowserModule, provideClientHydration } from '@angular/platform-browser';
import { NgxEchartsModule } from 'ngx-echarts'; // Import NgxEchartsModule
import { HighchartsChartModule } from 'highcharts-angular';
import { DatePipe, registerLocaleData } from '@angular/common'; // Import DatePipe
import { CommonModule } from '@angular/common'; // Đảm bảo CommonModule được import
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
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

import { NZ_I18N, vi_VN } from 'ng-zorro-antd/i18n';
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
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzCarouselModule } from 'ng-zorro-antd/carousel';
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
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzSpaceModule } from 'ng-zorro-antd/space';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzResultModule } from 'ng-zorro-antd/result';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';

import { SortByCheckinTimePipe } from './pipes/sort-by-checkin-time.pipe';
import { FilterPipe } from './pipes/filter.pipe';
import { UnauthorizedComponent } from './components/unauthorized/unauthorized.component';
import { NotfoundComponent } from './components/notfound/notfound.component';
import { RoomContentModalComponent } from './components/room-content-modal/room-content-modal.component';
import { InvoiceComponent } from './components/invoice/invoice.component';
import { RoomContextMenuComponent } from './components/room-context-menu/room-context-menu.component';
import { TransferRoomModalComponent } from './components/transfer-room-modal/transfer-room-modal.component';
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
import { GuestManagementComponent } from './components/guest-management/guest-management.component';
import { GuestSaveModalComponent } from './components/guest-save-modal/guest-save-modal.component';
import { OcrScannerComponent } from './components/ocr-scanner/ocr-scanner.component';
import { DebtManagementComponent } from './components/debt-management/debt-management.component';
import { BlogManagementComponent } from './components/blog-management/blog-management.component';
import { BlogComponent } from './components/blog/blog.component';
import { FinancialSummaryReportComponent } from './components/financial-summary-report/financial-summary-report.component';
import { InvoiceModalComponent } from './components/invoice-modal/invoice-modal.component';
import { UserManagementComponent } from './components/user-management/user-management.component';
import { UserFormModalComponent } from './components/user-management/user-form-modal/user-form-modal.component';
import { BankTransferHistoryComponent } from './components/bank-transfer-history/bank-transfer-history.component';
import { NlToBrPipe } from './pipes/nl-to-br.pipe';
import { AiChatboxComponent } from './components/ai-chatbox/ai-chatbox.component';
import { PricingComponent } from './components/pricing/pricing.component';
import { PricingManagementModule } from './components/pricing-management/pricing-management.module';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import vi from '@angular/common/locales/vi';
import { AuthInterceptor } from './auth.interceptor'; // Import AuthInterceptor
import { OtaManagementComponent } from './components/ota-management/ota-management.component'; // Import OtaManagementComponent
import { ShiftHandoverHistoryComponent } from './components/shift-handover-history/shift-handover-history.component';
import { BookingModalComponent } from './components/booking-modal/booking-modal.component';
import { PaypalPaymentComponent } from './components/paypal-payment/paypal-payment.component';
import { CryptoPaymentComponent } from './components/crypto-payment/crypto-payment.component';
import { FooterComponent } from './components/footer/footer.component';
import { TuyaSwitchComponent } from './components/tuya-switch/tuya-switch.component';
import { TuyaSwitchCompactComponent } from './components/tuya-switch/tuya-switch-compact.component';
import { SepayOAuth2CallbackComponent } from './components/sepay-oauth2-callback/sepay-oauth2-callback.component';
import { ProfileComponent } from './components/profile/profile.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { SettingsComponent } from './components/settings/settings.component';
import { MaintenanceComponent } from './components/maintenance/maintenance.component';
import { PrivacyPolicyComponent } from './components/privacy-policy/privacy-policy.component';
import { TermsOfServiceComponent } from './components/terms-of-service/terms-of-service.component';

registerLocaleData(vi);

// Custom loader để load translation files
export class CustomTranslateLoader implements TranslateLoader {
  constructor(private http: HttpClient) {}

  getTranslation(lang: string): Observable<any> {
    return this.http.get(`./assets/i18n/${lang}.json`);
  }
}

// Factory function để load translation files
export function HttpLoaderFactory(http: HttpClient): CustomTranslateLoader {
  return new CustomTranslateLoader(http);
}

@NgModule({
    declarations: [
        AppComponent,
        HeaderComponent,
        ProductListComponent,
        LoginComponent,
        HomeComponent,
        SignupComponent,
        ForgotPasswordComponent,
        ResetPasswordComponent,
        SettingsComponent,
        MaintenanceComponent,
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
        RoomContextMenuComponent,
        TransferRoomModalComponent,
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
        GuestManagementComponent,
        GuestSaveModalComponent,
        OcrScannerComponent,
        DebtManagementComponent,
        BlogManagementComponent,
        BlogComponent,
        FinancialSummaryReportComponent,
        InvoiceModalComponent,
        UserManagementComponent,
        UserFormModalComponent,
        BankTransferHistoryComponent,
        SepayOAuth2CallbackComponent,
        NlToBrPipe,
        AiChatboxComponent,
        PricingComponent,
        OtaManagementComponent, // Thêm OtaManagementComponent vào declarations
        ShiftHandoverHistoryComponent,
        BookingModalComponent,
        PaypalPaymentComponent,
        CryptoPaymentComponent,
        FooterComponent,
        TuyaSwitchComponent,
        TuyaSwitchCompactComponent,
        ProfileComponent,
        PrivacyPolicyComponent,
        TermsOfServiceComponent
    ],
    bootstrap: [AppComponent],
    imports: [
        BrowserModule,
        CommonModule, // Đảm bảo CommonModule được import ở đây
        NgxEchartsModule.forRoot({ echarts: () => import('echarts') }),
        HighchartsChartModule,
        AppRoutingModule,
        FormsModule,
        ReactiveFormsModule,
        HttpClientModule,
        NzMenuModule,
        NzToolTipModule,
        NzButtonModule,
        NzIconModule,
        NzCollapseModule,
        NzLayoutModule,
        NzBreadCrumbModule,
        NzGridModule, // Đảm bảo NzGridModule (cho nz-row, nz-col) được import
        NzSliderModule,
        NzSwitchModule,
        NzTableModule,
        NzRadioModule,
        NzDividerModule,
        NzCardModule,
        NzModalModule,
        NzTabsModule,
        NzPopconfirmModule,
        NzSelectModule,
        NzInputModule,
        NzDropDownModule,
        NzCarouselModule,
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
        NzCheckboxModule, // Đảm bảo NzCheckboxModule được import
        NzStatisticModule,
        NzBadgeModule,
        NzFormModule, // Đảm bảo NzFormModule được import
        NzDatePickerModule,
        NzSpaceModule,
        NzPageHeaderModule,
        NzResultModule,
        NzProgressModule,
        NzPaginationModule,
        BrowserAnimationsModule,
        PricingManagementModule,
        TranslateModule.forRoot({
          loader: {
            provide: TranslateLoader,
            useFactory: HttpLoaderFactory,
            deps: [HttpClient]
          },
          defaultLanguage: 'vi'
        })
    ],
    providers: [
        provideClientHydration(),
        { provide: NZ_I18N, useValue: vi_VN },
        provideAnimationsAsync(),
        provideHttpClient(withInterceptorsFromDi()),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
        DatePipe
    ]
})
export class AppModule { }
