import { Component, OnInit, OnDestroy } from '@angular/core';
import { PermissionService, PermissionFeature } from '../../services/permission.service';
import { AuthService } from '../../services/auth.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';

interface MenuItem {
  title: string;
  icon?: string; // Optional vì children items có thể không cần icon
  route?: string;
  feature?: PermissionFeature;
  children?: MenuItem[];
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent implements OnInit, OnDestroy {
  isSidebarOpen = true;
  isCollapsed = false;
  menuItems: MenuItem[] = [];
  private destroy$ = new Subject<void>();

  constructor(
    private permissionService: PermissionService,
    private authService: AuthService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.initializeMenuItems();
    this.permissionService.permissions$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.filterMenuItems();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeMenuItems(): void {
    // Subscribe to language changes to update menu items
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updateMenuItems();
    });

    this.updateMenuItems();
  }

  private updateMenuItems(): void {
    this.menuItems = [
      {
        title: this.translate.instant('SIDEBAR.HOME'),
        icon: 'home',
        route: '/home'
      },
      {
        title: this.translate.instant('SIDEBAR.BUSINESS_SIGNUP'),
        icon: 'shop',
        route: '/business-signup'
      },
      {
        title: this.translate.instant('SIDEBAR.ACCOUNT'),
        icon: 'user',
        children: [
          { title: this.translate.instant('SIDEBAR.LOGIN'), route: '/login' },
          { title: this.translate.instant('SIDEBAR.SIGNUP'), route: '/signup' }
        ]
      },
      {
        title: this.translate.instant('SIDEBAR.MANAGEMENT'),
        icon: 'setting',
        children: [
          {
            title: this.translate.instant('SIDEBAR.COMPANY_MANAGEMENT'),
            route: '/admin/company',
            feature: 'company_management'
          },
          {
            title: this.translate.instant('SIDEBAR.HOTEL_MANAGEMENT'),
            route: '/admin/hotel',
            feature: 'hotel_management'
          },
          {
            title: this.translate.instant('SIDEBAR.ROOM_MANAGEMENT'),
            route: '/admin/room-management',
            feature: 'room_management'
          },
          {
            title: this.translate.instant('SIDEBAR.SERVICE_MANAGEMENT'),
            route: '/service-management',
            feature: 'service_management'
          },
          {
            title: this.translate.instant('SIDEBAR.STAFF_MANAGEMENT'),
            route: '/admin/staff',
            feature: 'staff_management'
          },
          {
            title: this.translate.instant('SIDEBAR.USER_MANAGEMENT'),
            route: '/admin/users-management',
            feature: 'user_management'
          },
          {
            title: this.translate.instant('SIDEBAR.PRICING_MANAGEMENT'),
            route: '/admin/pricing-management',
            feature: 'pricing_management'
          },
          {
            title: this.translate.instant('SIDEBAR.OTA_MANAGEMENT'),
            route: '/admin/ota-management',
            feature: 'ota_management'
          }
        ]
      },
      {
        title: this.translate.instant('SIDEBAR.ROOM'),
        icon: 'home',
        route: '/admin/room',
        feature: 'room_management'
      },
      {
        title: this.translate.instant('SIDEBAR.REVENUE_CHART'),
        icon: 'bar-chart',
        route: '/admin/chart',
        feature: 'revenue_chart'
      },
      {
        title: this.translate.instant('SIDEBAR.SHIFT_HANDOVER'),
        icon: 'swap',
        route: '/admin/shift-handover',
        feature: 'shift_handover'
      },
      {
        title: this.translate.instant('SIDEBAR.BANK_TRANSFER_HISTORY'),
        icon: 'bank',
        route: '/admin/bank-transfer-history',
        feature: 'bank_transfer_history'
      },
      {
        title: this.translate.instant('SIDEBAR.CALENDAR'),
        icon: 'calendar',
        route: '/admin/calendar',
        feature: 'calendar'
      },
      {
        title: this.translate.instant('SIDEBAR.EMAIL_MANAGEMENT'),
        icon: 'mail',
        route: '/admin/email-admin',
        feature: 'email_admin'
      },
      {
        title: this.translate.instant('SIDEBAR.QR_PAYMENT'),
        icon: 'qrcode',
        route: '/admin/qr-payment',
        feature: 'qr_payment'
      },
      {
        title: this.translate.instant('SIDEBAR.VISA_PAYMENT'),
        icon: 'credit-card',
        route: '/admin/visa-payment',
        feature: 'visa_payment'
      },
      {
        title: this.translate.instant('SIDEBAR.E_INVOICE'),
        icon: 'file-text',
        children: [
          {
            title: this.translate.instant('SIDEBAR.E_INVOICE_REGISTRATION'),
            route: '/e-invoice-registration'
          },
          {
            title: this.translate.instant('SIDEBAR.E_INVOICE_MANAGEMENT'),
            route: '/admin/e-invoice-management'
          },
          {
            title: this.translate.instant('SIDEBAR.E_INVOICE_TEMPLATE'),
            route: '/admin/e-invoice-template'
          }
        ]
      }
    ];

    this.filterMenuItems();
  }

  private filterMenuItems(): void {
    const user = this.authService.getCurrentUser();
    
    // Superadmin thấy tất cả
    if (user?.role === 'superadmin') {
      return;
    }

    // Filter menu items dựa trên permissions
    this.menuItems = this.menuItems.map(item => {
      if (item.children) {
        const filteredChildren = item.children.filter(child => {
          if (child.feature) {
            return this.permissionService.hasFeatureAccess(child.feature);
          }
          return true; // Menu items không có feature requirement
        });
        
        // Chỉ hiển thị parent nếu có ít nhất một child
        if (filteredChildren.length > 0) {
          return { ...item, children: filteredChildren };
        }
        return null;
      } else {
        if (item.feature) {
          return this.permissionService.hasFeatureAccess(item.feature) ? item : null;
        }
        return item; // Menu items không có feature requirement
      }
    }).filter(item => item !== null) as MenuItem[];
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  toggleCollapsed(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  hasAccess(feature?: PermissionFeature): boolean {
    if (!feature) return true;
    return this.permissionService.hasFeatureAccess(feature);
  }
}
