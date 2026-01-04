import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd, Params } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { NzMarks } from 'ng-zorro-antd/slider';
import { RoomsService } from '../../services/rooms.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  // breadcrumbs: string[] = []; dành cho 1 breadcrumb
  breadcrumbs: Array<{ label: string, url: string }> = []; //dành cho route kiểu admin/hotel
  isCollapsed = false;
  showModal: boolean = false;
  
  // Modal states cho lọc tầng và số cột
  isFloorFilterModalVisible = false;
  isColumnsModalVisible = false;
  tempSelectedFloor: string | null = null;
  tempColumnCount: number = 6;
  availableFloors: string[] = [];
  selectedHotelIdForFilter: string | null = null;
  isLoadingFloors = false;
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
    private roomsService: RoomsService
  ) { }

  ngOnInit(): void {
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
  
  // Menu Hotel (Room, Shift Handover, Calendar, Bank Transfer History)
  // Staff được phép truy cập menu này
  canAccessHotelMenu(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager() ||
           this.authService.isStaff();
  }

  // Business Management - superadmin, admin, và business (chỉ quản lý business của mình)
  canAccessBusinessManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness();
  }

  // Hotel Management - superadmin, admin, business, và hotel (chỉ quản lý hotel của mình)
  canAccessHotelManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() ||
           this.authService.isHotelManager();
  }

  // Room Management - superadmin, admin, business, hotel
  canAccessRoomManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager();
  }

  // Staff Management - superadmin, admin, business, hotel
  canAccessStaffManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager();
  }

  // User Management - superadmin, admin, và business (chỉ xem)
  canAccessUserManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness();
  }

  // Service Management - superadmin, admin, business, hotel
  canAccessServiceManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager();
  }

  // Guest Management - superadmin, admin, business, hotel, staff
  canAccessGuestManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager() ||
           this.authService.isStaff();
  }

  // Debt Management - superadmin, admin, business, hotel
  canAccessDebtManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager();
  }

  // Contact Management - chỉ superadmin và admin
  canAccessContactManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin();
  }

  // Blog Management - chỉ superadmin và admin
  canAccessBlogManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin();
  }

  // OTA Management - superadmin, admin, business, hotel
  canAccessOTAManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager();
  }

  // Pricing Management - tất cả các role đều có thể truy cập
  canAccessPricingManagement(): boolean {
    return true; // Cho phép tất cả role truy cập
  }

  // Electric Setting - superadmin, admin, business, hotel
  canAccessElectricSetting(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager();
  }

  // Payment Menu (QR Payment, Visa Payment) - superadmin, admin, business, hotel
  canAccessPaymentMenu(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager();
  }

  // Email Admin - Chỉ superadmin và admin
  canAccessEmailAdmin(): boolean {
    return this.authService.isSuperAdmin() || this.authService.isAdmin();
  }

  // File - Tất cả role
  canAccessFile(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager() || 
           this.authService.isStaff();
  }

  // Settings - Chỉ superadmin và admin
  canAccessSettings(): boolean {
    return this.authService.isSuperAdmin() || this.authService.isAdmin();
  }

  // Shift Handover History - superadmin, admin, business, hotel
  canAccessShiftHandoverHistory(): boolean {
    const rules = this.authService.getPermissionRules();
    return rules.canViewShiftHistory;
  }

  // Financial Summary Report - chỉ superadmin và business
  canAccessFinancialSummary(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isBusiness();
  }

  // E-Invoice - superadmin, admin, business, hotel, staff
  canAccessEInvoice(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager() ||
           this.authService.isStaff();
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
    // Lấy selectedHotelId từ localStorage
    const selectedHotelId = localStorage.getItem('selectedHotelId');
    this.selectedHotelIdForFilter = selectedHotelId;
    
    // Lấy giá trị hiện tại từ localStorage
    const savedFloor = localStorage.getItem('selectedFloor');
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
    // Lưu vào localStorage (room component sẽ đọc từ đây)
    if (this.tempSelectedFloor) {
      localStorage.setItem('selectedFloor', this.tempSelectedFloor);
    } else {
      localStorage.removeItem('selectedFloor');
    }
    // Emit event để room component cập nhật ngay lập tức (trigger onFloorChange)
    window.dispatchEvent(new CustomEvent('floorFilterChanged', { detail: this.tempSelectedFloor }));
    this.isFloorFilterModalVisible = false;
  }

  // Mở modal số cột
  openColumnsModal(): void {
    // Lấy giá trị hiện tại từ localStorage
    const savedCount = localStorage.getItem('roomColumnsCount');
    this.tempColumnCount = savedCount ? parseInt(savedCount, 10) : 6;
    this.isColumnsModalVisible = true;
  }

  // Áp dụng số cột
  applyColumns(): void {
    // Lưu vào localStorage (room component sẽ đọc từ đây)
    localStorage.setItem('roomColumnsCount', this.tempColumnCount.toString());
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
