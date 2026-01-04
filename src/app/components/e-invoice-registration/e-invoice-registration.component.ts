import { Component, OnInit } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface EInvoicePackage {
  id: string;
  name: string;
  invoiceCount: number;
  packagePrice: number;
  pricePerInvoice: number;
  selected: boolean;
  quantity: number;
}

interface DigitalSignaturePricing {
  duration: string;
  price: number;
}

@Component({
  selector: 'app-e-invoice-registration',
  templateUrl: './e-invoice-registration.component.html',
  styleUrls: ['./e-invoice-registration.component.css']
})
export class EInvoiceRegistrationComponent implements OnInit {
  loading = false;
  packages: EInvoicePackage[] = [];
  selectedPackages: EInvoicePackage[] = [];
  totalAmount = 0;
  currentUser: any = null;
  
  // Digital signature pricing
  digitalSignaturePricing: DigitalSignaturePricing[] = [
    { duration: '1 năm', price: 1272000 },
    { duration: '2 năm', price: 2544000 },
    { duration: '3 năm', price: 3816000 }
  ];

  constructor(
    private http: HttpClient,
    private message: NzMessageService,
    private authService: AuthService
  ) {
    this.initializePackages();
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadExistingPackages();
  }

  initializePackages(): void {
    this.packages = [
      {
        id: 'einvoice-300',
        name: 'elnvoice-300',
        invoiceCount: 300,
        packagePrice: 180000,
        pricePerInvoice: 600,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-500',
        name: 'elnvoice-500',
        invoiceCount: 500,
        packagePrice: 240000,
        pricePerInvoice: 480,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-1k',
        name: 'elnvoice-1K',
        invoiceCount: 1000,
        packagePrice: 450000,
        pricePerInvoice: 450,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-3k',
        name: 'elnvoice-3K',
        invoiceCount: 3000,
        packagePrice: 720000,
        pricePerInvoice: 240,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-5k',
        name: 'elnvoice-5K',
        invoiceCount: 5000,
        packagePrice: 900000,
        pricePerInvoice: 180,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-10k',
        name: 'elnvoice-10K',
        invoiceCount: 10000,
        packagePrice: 1610000,
        pricePerInvoice: 161,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-20k',
        name: 'elnvoice-20K',
        invoiceCount: 20000,
        packagePrice: 3000000,
        pricePerInvoice: 150,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-50k',
        name: 'elnvoice-50K',
        invoiceCount: 50000,
        packagePrice: 6500000,
        pricePerInvoice: 130,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-200k',
        name: 'elnvoice-200K',
        invoiceCount: 200000,
        packagePrice: 20000000,
        pricePerInvoice: 100,
        selected: false,
        quantity: 0
      }
    ];
  }

  loadExistingPackages(): void {
    // TODO: Load existing packages from backend if needed
  }

  onPackageSelect(pkg: EInvoicePackage): void {
    pkg.selected = true;
    pkg.quantity = 1;
    if (!this.selectedPackages.find(p => p.id === pkg.id)) {
      this.selectedPackages.push(pkg);
    }
    this.calculateTotal();
  }

  onPackageDeselect(pkg: EInvoicePackage): void {
    pkg.selected = false;
    pkg.quantity = 0;
    this.selectedPackages = this.selectedPackages.filter(p => p.id !== pkg.id);
    this.calculateTotal();
  }

  onQuantityChange(pkg: EInvoicePackage, quantity: number): void {
    if (quantity <= 0 || !quantity) {
      this.onPackageDeselect(pkg);
    } else {
      pkg.quantity = quantity;
      this.calculateTotal();
    }
  }

  calculateTotal(): void {
    this.totalAmount = this.selectedPackages.reduce((sum, pkg) => {
      return sum + (pkg.packagePrice * pkg.quantity);
    }, 0);
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('vi-VN').format(price);
  }

  onSubmit(): void {
    if (this.selectedPackages.length === 0) {
      this.message.warning('Vui lòng chọn ít nhất một gói hóa đơn điện tử');
      return;
    }

    if (!this.currentUser) {
      this.message.error('Vui lòng đăng nhập để tiếp tục');
      return;
    }

    this.loading = true;
    
    const orderData = {
      userId: this.currentUser._id || this.currentUser.id,
      packages: this.selectedPackages.map(pkg => ({
        packageId: pkg.id,
        packageName: pkg.name,
        quantity: pkg.quantity,
        invoiceCount: pkg.invoiceCount,
        packagePrice: pkg.packagePrice,
        totalPrice: pkg.packagePrice * pkg.quantity
      })),
      totalAmount: this.totalAmount
    };

    // TODO: Call API to create order
    this.http.post(`${environment.apiUrl}/e-invoice/register`, orderData).subscribe({
      next: (response: any) => {
        this.loading = false;
        if (response.success !== false) {
          this.message.success('Đăng ký gói hóa đơn điện tử thành công!');
          // Reset form
          this.selectedPackages = [];
          this.packages.forEach(pkg => {
            pkg.selected = false;
            pkg.quantity = 0;
          });
          this.totalAmount = 0;
        } else {
          this.message.error(response.message || 'Có lỗi xảy ra khi đăng ký');
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error registering e-invoice packages:', error);
        this.message.error(error.error?.message || 'Có lỗi xảy ra khi đăng ký');
      }
    });
  }

  onDigitalSignatureLinkClick(): void {
    // TODO: Navigate to digital signature pricing page or open modal
    this.message.info('Chức năng đang được phát triển');
  }
}

