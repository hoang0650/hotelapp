import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd, Params } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';

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
  constructor(
    private router: Router, 
    private activatedRoute: ActivatedRoute,
    private authService: AuthService
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
  canAccessHotelMenu(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager() || 
           this.authService.isStaff();
  }

  // Business Management - Chỉ superadmin và admin
  canAccessBusinessManagement(): boolean {
    return this.authService.isSuperAdmin() || this.authService.isAdmin();
  }

  // Hotel Management - superadmin, admin, business
  canAccessHotelManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness();
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

  // User Management - Chỉ superadmin và admin
  canAccessUserManagement(): boolean {
    return this.authService.isSuperAdmin() || this.authService.isAdmin();
  }

  // Service Management - superadmin, admin, business, hotel
  canAccessServiceManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager();
  }

  // OTA Management - superadmin, admin, business, hotel
  canAccessOTAManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager();
  }

  // Pricing Management - superadmin, admin, business
  canAccessPricingManagement(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness();
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

}
