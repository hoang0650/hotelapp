import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd, Params } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { NzMarks } from 'ng-zorro-antd/slider';
import { RoomsService } from '../../services/rooms.service';
import { SessionContextService } from '../../services/session-context.service';
import { UserService } from '../../services/user.service';
import { TranslationService } from '../../services/translation.service';
import { ThemeService } from '../../services/theme.service';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../../../environments/environment';
import { PaymentSpeakerService } from '../../services/payment-speaker.service';
import { io, Socket } from 'socket.io-client';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit, OnDestroy {
  breadcrumbs: Array<{ label: string, url: string }> = [];
  isCollapsed = false;
  isMobileMenuOpen = false;
  showModal: boolean = false;
  /** Ẩn nút settings trên breadcrumb khi đang ở /admin/room (nút nằm dưới Phiếu chi). */
  isRoomRoute = false;
  
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

  currentLang = 'vi';
  isDarkTheme = false;
  private readonly apiBaseUrl = environment.apiUrl;
  private readonly openFloorFilterHandler = () => this.openFloorFilterModal();
  private readonly openColumnsHandler = () => this.openColumnsModal();
  private readonly paymentSpeakerChangedHandler = (event: Event) =>
    this.handlePaymentSpeakerChanged(event as CustomEvent);
  private langSub?: Subscription;
  private themeSub?: Subscription;
  private hotelSub?: Subscription;
  private paymentSocket: Socket | null = null;
  private paymentSocketHotelId: string | null = null;
  
  constructor(
    private router: Router, 
    private activatedRoute: ActivatedRoute,
    private authService: AuthService,
    private userService: UserService,
    private roomsService: RoomsService,
    private permissionService: PermissionService,
    private sessionContext: SessionContextService,
    private translationService: TranslationService,
    private themeService: ThemeService,
    private translate: TranslateService,
    private paymentSpeakerService: PaymentSpeakerService
  ) { }

  ngOnInit(): void {
    this.currentLang = this.translationService.getCurrentLang() || this.translate.currentLang || 'vi';
    this.isDarkTheme = this.themeService.isDark;
    this.langSub = this.translationService.currentLang$.subscribe(lang => {
      this.currentLang = lang || 'vi';
    });
    this.themeSub = this.themeService.theme$.subscribe(theme => {
      this.isDarkTheme = theme === 'dark';
    });

    this.permissionService.ready$.subscribe(ready => {
      this.permissionsReady = ready;
    });

    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        map(() => this.buildBreadcrumb(this.activatedRoute.root))
      )
      .subscribe(breadcrumbs => {
        this.breadcrumbs = breadcrumbs;
        this.isRoomRoute = this.router.url.split('?')[0] === '/admin/room';
      });
    this.isRoomRoute = this.router.url.split('?')[0] === '/admin/room';
    window.addEventListener('openAdminFloorFilter', this.openFloorFilterHandler);
    window.addEventListener('openAdminColumnsModal', this.openColumnsHandler);
    window.addEventListener('hotelPaymentSpeakerChanged', this.paymentSpeakerChangedHandler);

    this.hotelSub = this.sessionContext.selectedHotelId$.subscribe((hotelId) => {
      this.syncPaymentSpeakerSocket(hotelId || this.authService.getHotelId());
    });
    this.syncPaymentSpeakerSocket(
      this.sessionContext.getSelectedHotelId() || this.authService.getHotelId()
    );
  }

  ngOnDestroy(): void {
    window.removeEventListener('openAdminFloorFilter', this.openFloorFilterHandler);
    window.removeEventListener('openAdminColumnsModal', this.openColumnsHandler);
    window.removeEventListener('hotelPaymentSpeakerChanged', this.paymentSpeakerChangedHandler);
    this.langSub?.unsubscribe();
    this.themeSub?.unsubscribe();
    this.hotelSub?.unsubscribe();
    this.stopPaymentSpeakerSocket();
  }

  private handlePaymentSpeakerChanged(event: CustomEvent): void {
    const detail = event?.detail || {};
    const hotelId = String(detail?.hotelId || '').trim();
    const currentHotelId = String(
      this.paymentSocketHotelId ||
      this.sessionContext.getSelectedHotelId() ||
      this.authService.getHotelId() ||
      ''
    ).trim();
    if (!hotelId || !currentHotelId || hotelId !== currentHotelId) {
      return;
    }
    this.paymentSpeakerService.setEnabled(hotelId, !!detail?.enabled);
  }

  private syncPaymentSpeakerSocket(hotelId: string | null | undefined): void {
    const id = String(hotelId || '').trim();
    if (!id) {
      this.stopPaymentSpeakerSocket();
      return;
    }

    this.paymentSpeakerService.loadEnabled(id);

    if (this.paymentSocket && this.paymentSocketHotelId === id) {
      if (this.paymentSocket.connected) {
        this.paymentSocket.emit('join_hotel', id);
      }
      return;
    }

    this.stopPaymentSpeakerSocket();

    const socketUrl = String(environment.apiUrl || '').replace(/\/$/, '');
    if (!socketUrl) return;

    this.paymentSocketHotelId = id;
    this.paymentSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true
    });

    this.paymentSocket.on('connect', () => {
      this.paymentSocket?.emit('join_hotel', this.paymentSocketHotelId);
    });

    this.paymentSocket.on('payment_received', (payload: any) => {
      this.paymentSpeakerService.tryPlayForPayment(payload, this.paymentSocketHotelId);
    });
  }

  private stopPaymentSpeakerSocket(): void {
    if (this.paymentSocket) {
      try {
        this.paymentSocket.off('connect');
        this.paymentSocket.off('payment_received');
        this.paymentSocket.disconnect();
      } catch (_e) {}
    }
    this.paymentSocket = null;
    this.paymentSocketHotelId = null;
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

  canAccessAiUsage(): boolean {
    return this.permissionService.canAccessRoute('/admin/ai-usage');
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

  getCurrentUserLabel(): string {
    const user = this.authService.getCurrentUser();
    return user?.fullName || user?.username || user?.email || 'Tài khoản';
  }

  getCurrentUserRoleLabel(): string {
    const role = String(this.authService.getCurrentUser()?.role || '').toUpperCase();
    if (!role) {
      return '';
    }
    const key = `ROLES.${role}`;
    const translated = this.translate.instant(key);
    return translated === key ? role : translated;
  }

  get currentLanguageLabel(): string {
    if (this.currentLang === 'en') {
      return this.translate.instant('LANGUAGE.EN');
    }
    if (this.currentLang === 'de') {
      return this.translate.instant('LANGUAGE.DE');
    }
    return this.translate.instant('LANGUAGE.VI');
  }

  private getImageUrl(urlOrId: string | null | undefined): string {
    if (!urlOrId) {
      return '';
    }
    if (urlOrId.startsWith('http://') || urlOrId.startsWith('https://')) {
      return urlOrId;
    }
    if (urlOrId.startsWith('/files/')) {
      return `${this.apiBaseUrl}${urlOrId}`;
    }
    return `${this.apiBaseUrl}/files/${urlOrId}`;
  }

  getAvatarUrl(): string {
    const user = this.authService.getCurrentUser();
    if (!user) {
      return 'assets/images/avatar.jpg';
    }
    const avatar = (user as any).avatar || (user as any).avatarId;
    if (!avatar) {
      return 'assets/images/avatar.jpg';
    }
    return this.getImageUrl(avatar);
  }

  handleAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = 'https://mdbcdn.b-cdn.net/img/new/avatars/2.webp';
    }
  }

  switchLanguage(lang: string): void {
    this.translationService.switchLanguage(lang);
    this.currentLang = lang;
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  openProfile(): void {
    this.router.navigate(['/admin/profile']);
  }

  logout(): void {
    this.userService.clearCurrentUser();
    this.authService.logout();
  }

}
