import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd, Params } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { NzMarks } from 'ng-zorro-antd/slider';
import { RoomsService } from '../../services/rooms.service';
import { SessionContextService } from '../../services/session-context.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  // breadcrumbs: string[] = []; dành cho 1 breadcrumb
  breadcrumbs: Array<{ label: string, url: string }> = []; //dành cho route kiểu admin/hotel
  isCollapsed = false;
  isMobileMenuOpen = false;
  showModal: boolean = false;
  
  // Modal states cho lọc tầng và số cột
  isFloorFilterModalVisible = false;
  isColumnsModalVisible = false;
  tempSelectedFloor: string | null = null;
  tempColumnCount: number = 6;
  availableFloors: string[] = [];
  selectedHotelIdForFilter: string | null = null;
  isLoadingFloors = false;
  permissionsReady = true;
  columnMarks: NzMarks = {
    2: '2',
    3: '3',
    4: '4',
    6: '6',
    8: '8',
    12: '12'
  };
  
  constructor(
    private router: Router, 
    private activatedRoute: ActivatedRoute,
    private authService: AuthService,
    private roomsService: RoomsService,
    private permissionService: PermissionService,
    private sessionContext: SessionContextService
  ) { }

  ngOnInit(): void {
    this.permissionService.ready$.subscribe(ready => {
      this.permissionsReady = ready;
    });

    // this.router.events
    //   .pipe(
    //     filter(event => event instanceof NavigationEnd),
    //     map(() => this.activatedRoute),
    //     map(route => {
    //       while (route.firstChild) {
    //         route = route.firstChild;
    //       }
    //       return route;
    //     }),
    //     map(route => route.snapshot),
    //     map(snapshot => snapshot.url.map(segment => segment.path))
    //   )
    //   .subscribe(paths => {
    //     this.breadcrumbs = paths;
    //   });
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        map(() => this.buildBreadcrumb(this.activatedRoute.root))
      )
      .subscribe(breadcrumbs => {
        this.breadcrumbs = breadcrumbs;
      });
  }

  

  toggleModal(show: boolean): void {
    this.showModal = show;
  }

  buildBreadcrumb(route: ActivatedRoute, url: string = '', breadcrumbs: Array<{ label: string, url: string }> = []): Array<{ label: string, url: string }> {
    const children: ActivatedRoute[] = route.children;

    if (children.length === 0) {
      return breadcrumbs;
    }

    for (const child of children) {
      const routeURL: string = child.snapshot.url.map(segment => segment.path).join('/');
      if (routeURL !== '') {
        url += `/${routeURL}`;
      }

      const label = child.snapshot.data['breadcrumb'] || routeURL;
      breadcrumbs.push({ label, url });

      return this.buildBreadcrumb(child, url, breadcrumbs);
    }

    return breadcrumbs;
  }

  // ============ KIỂM TRA QUYỀN HIỂN THỊ MENU ============
  
  canAccessHotelMenu(): boolean {
    return this.permissionService.hasFeatureAccess('room_management') ||
           this.permissionService.hasFeatureAccess('shift_handover') ||
           this.permissionService.hasFeatureAccess('calendar') ||
           this.permissionService.hasFeatureAccess('bank_transfer_history');
  }

  canAccessBusinessManagement(): boolean {
    return this.permissionService.hasFeatureAccess('company_management');
  }

  canAccessHotelManagement(): boolean {
    return this.permissionService.hasFeatureAccess('hotel_management');
  }

  canAccessRoomManagement(): boolean {
    return this.permissionService.hasFeatureAccess('room_management');
  }

  canAccessStaffManagement(): boolean {
    return this.permissionService.hasFeatureAccess('staff_management');
  }

  canAccessUserManagement(): boolean {
    return this.permissionService.hasFeatureAccess('user_management');
  }

  canAccessServiceManagement(): boolean {
    return this.permissionService.hasFeatureAccess('service_management');
  }

  canAccessGuestManagement(): boolean {
    return this.permissionService.hasFeatureAccess('room_management');
  }

  canAccessDebtManagement(): boolean {
    return this.permissionService.hasFeatureAccess('room_management');
  }

  canAccessContactManagement(): boolean {
    return this.permissionService.canAccessRoute('/admin/contact-management');
  }

  canAccessBlogManagement(): boolean {
    return this.permissionService.canAccessRoute('/admin/blog-management');
  }

  canAccessOTAManagement(): boolean {
    return this.permissionService.hasFeatureAccess('ota_management');
  }

  canAccessPricingManagement(): boolean {
    return this.permissionService.canAccessRoute('/admin/pricing-management');
  }

  canAccessElectricSetting(): boolean {
    return this.permissionService.hasFeatureAccess('electric_management');
  }

  canAccessFanpageMessages(): boolean {
    return this.permissionService.hasFeatureAccess('fanpage_messages');
  }

  canAccessPaymentMenu(): boolean {
    return this.permissionService.hasFeatureAccess('qr_payment') ||
           this.permissionService.hasFeatureAccess('visa_payment');
  }

  canAccessEmailAdmin(): boolean {
    return this.permissionService.hasFeatureAccess('email_admin');
  }

  canAccessFile(): boolean {
    return this.permissionService.canAccessRoute('/admin/files');
  }

  canAccessSettings(): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) {
      return false;
    }

    return ['superadmin', 'admin', 'business', 'hotel', 'staff'].includes(user.role);
  }

  canManageSystemSettings(): boolean {
    return this.authService.isSuperAdmin() || this.authService.isAdmin();
  }

  getSettingsMenuLabel(): string {
    return this.canManageSystemSettings() ? 'Cài đặt hệ thống' : 'Cài đặt phạm vi làm việc';
  }

  getSettingsMenuDescription(): string {
    return this.canManageSystemSettings()
      ? 'Quản trị cấu hình chung'
      : 'Xem hoặc chỉnh cài đặt theo quyền hiện tại';
  }

  canAccessBotSetting(): boolean {
    return this.permissionService.canAccessRoute('/admin/bot-setting');
  }

  canAccessShiftHandoverHistory(): boolean {
    return this.permissionService.hasFeatureAccess('shift_handover');
  }

  canAccessFinancialSummary(): boolean {
    return this.permissionService.hasFeatureAccess('revenue_chart');
  }

  canAccessEInvoice(): boolean {
    return this.authService.isSuperAdmin();
  }

  // ============ MOBILE MENU ============
  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu(event?: Event): void {
    if (event) {
      const target = event.target as HTMLElement;
      // Chỉ đóng sidebar khi người dùng click vào một mục menu thực sự (menu item),
      // bỏ qua việc đóng nếu click vào các tiêu đề menu con (để mở dropdown)
      if (!target.closest('.ant-menu-item')) {
        return;
      }
    }
    this.isMobileMenuOpen = false;
  }

  // Mở trang Settings
  openSettings(): void {
    if (this.canAccessSettings()) {
      this.router.navigate(['/admin/settings']);
    }
  }

  // Navigate đến Pricing Management
  navigateToPricing(): void {
    this.router.navigate(['/admin/pricing-management']);
  }

  // Navigate đến Electric Setting
  navigateToElectric(): void {
    this.router.navigate(['/admin/electric-setting']);
  }

  // Mở modal lọc theo tầng
  openFloorFilterModal(): void {
    const selectedHotelId = this.sessionContext.getSelectedHotelId();
    this.selectedHotelIdForFilter = selectedHotelId;
    
    const savedFloor = this.sessionContext.getSelectedFloor();
    this.tempSelectedFloor = savedFloor || null;
    
    if (selectedHotelId) {
      this.isLoadingFloors = true;
      this.availableFloors = [];
      
      this.roomsService.getHotelFloors(selectedHotelId).subscribe(
        data => {
          // Convert number[] sang string[] như trong room component
          this.availableFloors = data.floors.map(f => String(f));
          // Sắp xếp floors: tầng trệt (0) lên đầu, sau đó sắp xếp số
          this.availableFloors.sort((a, b) => {
            if (a === '0' || a === '') return -1;
            if (b === '0' || b === '') return 1;
            return parseInt(a, 10) - parseInt(b, 10);
          });
          this.isLoadingFloors = false;
          this.isFloorFilterModalVisible = true;
        },
        error => {
          console.error('Error loading floors:', error);
          this.availableFloors = [];
          this.isLoadingFloors = false;
          this.isFloorFilterModalVisible = true;
        }
      );
    } else {
      // Nếu chưa chọn hotel, vẫn mở modal nhưng hiển thị cảnh báo
      this.availableFloors = [];
      this.isFloorFilterModalVisible = true;
    }
  }

  // Áp dụng lọc tầng
  applyFloorFilter(): void {
    this.sessionContext.setSelectedFloor(this.tempSelectedFloor);
    // Emit event để room component cập nhật ngay lập tức (trigger onFloorChange)
    window.dispatchEvent(new CustomEvent('floorFilterChanged', { detail: this.tempSelectedFloor }));
    this.isFloorFilterModalVisible = false;
  }

  // Mở modal số cột
  openColumnsModal(): void {
    const savedCount = this.sessionContext.getRoomColumnsCount();
    this.tempColumnCount = savedCount ?? 6;
    this.isColumnsModalVisible = true;
  }

  // Áp dụng số cột
  applyColumns(): void {
    this.sessionContext.setRoomColumnsCount(this.tempColumnCount);
    // Emit event để room component cập nhật ngay lập tức (trigger reGenerateArray)
    window.dispatchEvent(new CustomEvent('columnsCountChanged', { detail: this.tempColumnCount }));
    this.isColumnsModalVisible = false;
  }

  // Helper để hiển thị tên tầng
  getFloorDisplayName(floor: string): string {
    if (floor === '0' || floor === '') {
      return 'Tầng trệt';
    }
    return `Tầng ${floor}`;
  }

}
