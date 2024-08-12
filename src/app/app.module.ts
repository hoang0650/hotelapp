import { NgModule } from '@angular/core';
import { BrowserModule, provideClientHydration } from '@angular/platform-browser';

import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';
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
import { SortByCheckinTimePipe } from './pipes/sort-by-checkin-time.pipe';
import { UnauthorizedComponent } from './components/unauthorized/unauthorized.component';
import { NotfoundComponent } from './components/notfound/notfound.component';
import { RoomContentModalComponent } from './components/room-content-modal/room-content-modal.component';
import { InvoiceComponent } from './components/invoice/invoice.component';
import { CompanyManagementComponent } from './components/company-management/company-management.component';
import { HotelManagementComponent } from './components/hotel-management/hotel-management.component';
import { RoomManagementComponent } from './components/room-management/room-management.component';
import { StaffManagementComponent } from './components/staff-management/staff-management.component';

registerLocaleData(en);

@NgModule({
  declarations: [
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
    UnauthorizedComponent,
    NotfoundComponent,
    RoomContentModalComponent,
    InvoiceComponent,
    CompanyManagementComponent,
    HotelManagementComponent,
    RoomManagementComponent,
    StaffManagementComponent
  ],
  imports: [
    BrowserModule,
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
    NzGridModule,
    NzSliderModule,
    NzSwitchModule,
    NzTableModule,
    NzRadioModule,
    NzDividerModule,
    NzFormModule,
    NzCardModule,
    NzModalModule
  ],
  providers: [
    provideClientHydration(),
    { provide: NZ_I18N, useValue: en_US },
    provideAnimationsAsync(),
    provideHttpClient()
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
