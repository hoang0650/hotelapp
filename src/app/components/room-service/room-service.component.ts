import { Component, OnInit, Input } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RoomServiceService, RoomService, ServiceOrder } from '../../services/room-service.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { OrderedService } from '../../interfaces/rooms';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-room-service',
  templateUrl: './room-service.component.html',
  styleUrls: ['./room-service.component.scss']
})
export class RoomServiceComponent implements OnInit {
  @Input() hotelId: string | null = null;
  @Input() roomId: string | null = null;

  services: RoomService[] = [];
  categories: string[] = [];
  selectedCategory: string = '';
  
  serviceForm: FormGroup;
  isServiceFormVisible = false;
  isEditing = false;
  editingServiceId: string | null = null;
  
  cart: OrderedService[] = [];
  totalAmount = 0;
  noteForOrder = '';
  
  isLoading = false;
  
  serviceOrders: ServiceOrder[] = [];
  displayOrders = false;

  constructor(
    private roomServiceService: RoomServiceService,
    private message: NzMessageService,
    private modal: NzModalService,
    private fb: FormBuilder,
    private translate: TranslateService
  ) {
    this.serviceForm = this.fb.group({
      name: ['', [Validators.required]],
      description: [''],
      price: [0, [Validators.required, Validators.min(0)]],
      category: ['custom', [Validators.required]],
      image: [''],
      isAvailable: [true],
      isActive: [true],
      isCustom: [false],
      currency: ['VND']
    });
  }

  ngOnInit(): void {
    this.loadServices();
    if (this.roomId) {
      this.loadServiceOrders();
    }
  }

  loadServices(): void {
    if (!this.hotelId) {
      this.message.error(this.translate.instant('ROOM_SERVICE.MESSAGES.NO_HOTEL'));
      return;
    }

    this.isLoading = true;
    this.roomServiceService.getServices({ hotelId: this.hotelId }).subscribe(
      (data) => {
        this.services = data;
        this.isLoading = false;
        this.loadCategories();
      },
      (error) => {
        this.message.error(this.translate.instant('ROOM_SERVICE.MESSAGES.LOAD_SERVICES_ERROR', { message: error.message }));
        this.isLoading = false;
      }
    );
  }

  loadCategories(): void {
    if (!this.hotelId) return;

    this.roomServiceService.getServiceCategories(this.hotelId).subscribe(
      (data) => {
        this.categories = data;
      },
      (error) => {
        this.message.error(this.translate.instant('ROOM_SERVICE.MESSAGES.LOAD_CATEGORIES_ERROR', { message: error.message }));
      }
    );
  }

  filterByCategory(category: string): void {
    this.selectedCategory = category;
  }

  getFilteredServices(): RoomService[] {
    if (!this.selectedCategory) {
      return this.services;
    }
    return this.services.filter(service => service.category === this.selectedCategory);
  }

  showAddServiceForm(): void {
    this.isEditing = false;
    this.editingServiceId = null;
    this.serviceForm.reset({
      name: '',
      description: '',
      price: 0,
      category: 'custom',
      image: '',
      isAvailable: true,
      isActive: true,
      isCustom: false,
      currency: 'VND'
    });
    this.isServiceFormVisible = true;
  }

  showEditServiceForm(service: RoomService): void {
    this.isEditing = true;
    this.editingServiceId = service._id;
    this.serviceForm.setValue({
      name: service.name,
      description: service.description || '',
      price: service.price,
      category: service.category || 'custom',
      image: service.image || '',
      isAvailable: service.isAvailable ?? true,
      isActive: service.isActive ?? true,
      isCustom: service.isCustom ?? false,
      currency: service.currency || 'VND'
    });
    this.isServiceFormVisible = true;
  }

  cancelServiceForm(): void {
    this.isServiceFormVisible = false;
  }

  submitServiceForm(): void {
    if (this.serviceForm.invalid) {
      this.message.error(this.translate.instant('ROOM_SERVICE.MESSAGES.REQUIRED_FIELDS'));
      return;
    }

    if (!this.hotelId) {
      this.message.error(this.translate.instant('ROOM_SERVICE.MESSAGES.NO_HOTEL'));
      return;
    }

    const serviceData: RoomService = {
      ...this.serviceForm.value,
      hotelId: this.hotelId,
      _id: this.editingServiceId || ''
    };

    this.isLoading = true;

    if (this.isEditing && this.editingServiceId) {
      this.roomServiceService.updateService(this.editingServiceId, serviceData).subscribe(
        (updatedService) => {
          this.message.success(this.translate.instant('ROOM_SERVICE.MESSAGES.UPDATE_SUCCESS'));
          this.isLoading = false;
          this.isServiceFormVisible = false;
          this.loadServices();
        },
        (error) => {
          this.message.error(this.translate.instant('ROOM_SERVICE.MESSAGES.UPDATE_ERROR', { message: error.message }));
          this.isLoading = false;
        }
      );
    } else {
      this.roomServiceService.createService(serviceData).subscribe(
        (newService) => {
          this.message.success(this.translate.instant('ROOM_SERVICE.MESSAGES.ADD_SUCCESS'));
          this.isLoading = false;
          this.isServiceFormVisible = false;
          this.loadServices();
        },
        (error) => {
          this.message.error(this.translate.instant('ROOM_SERVICE.MESSAGES.ADD_ERROR', { message: error.message }));
          this.isLoading = false;
        }
      );
    }
  }

  deleteService(serviceId: string): void {
    this.modal.confirm({
      nzTitle: 'Xác nhận xóa dịch vụ',
      nzContent: 'Bạn có chắc chắn muốn xóa dịch vụ này?',
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOnOk: () => {
        this.isLoading = true;
        this.roomServiceService.deleteService(serviceId).subscribe(
          () => {
            this.message.success(this.translate.instant('ROOM_SERVICE.MESSAGES.DELETE_SUCCESS'));
            this.isLoading = false;
            this.loadServices();
          },
          (error) => {
            this.message.error(this.translate.instant('ROOM_SERVICE.MESSAGES.DELETE_ERROR', { message: error.message }));
            this.isLoading = false;
          }
        );
      }
    });
  }

  // ===== Quản lý giỏ hàng =====

  addToCart(service: RoomService): void {
    const existingItem = this.cart.find(item => item.serviceId === service._id);
    
    if (existingItem) {
      existingItem.quantity += 1;
      existingItem.totalPrice = existingItem.quantity * existingItem.price;
    } else {
      this.cart.push({
        serviceId: service._id,
        serviceName: service.name,
        quantity: 1,
        price: service.price,
        totalPrice: service.price
      });
    }
    
    this.calculateTotal();
    this.message.success(this.translate.instant('ROOM_SERVICE.MESSAGES.CART_ADDED', { name: service.name }));
  }

  updateCartItemQuantity(item: OrderedService, change: number): void {
    const newQuantity = item.quantity + change;
    
    if (newQuantity <= 0) {
      this.removeFromCart(item);
      return;
    }
    
    item.quantity = newQuantity;
    item.totalPrice = item.quantity * item.price;
    this.calculateTotal();
  }

  removeFromCart(item: OrderedService): void {
    const index = this.cart.findIndex(i => i.serviceId === item.serviceId);
    if (index > -1) {
      this.cart.splice(index, 1);
      this.calculateTotal();
    }
  }

  calculateTotal(): void {
    this.totalAmount = this.cart.reduce((total, item) => {
      const itemTotal = item.totalPrice !== undefined ? 
        item.totalPrice : (item.price * item.quantity);
      return total + itemTotal;
    }, 0);
  }

  clearCart(): void {
    this.cart = [];
    this.totalAmount = 0;
    this.noteForOrder = '';
  }

  submitOrder(): void {
    if (!this.hotelId || !this.roomId) {
      this.message.error(this.translate.instant('ROOM_SERVICE.MESSAGES.NO_ROOM_OR_HOTEL'));
      return;
    }

    if (this.cart.length === 0) {
      this.message.warning('Giỏ hàng trống');
      return;
    }

    const order: ServiceOrder = {
      roomId: this.roomId,
      hotelId: this.hotelId,
      services: [...this.cart],
      totalAmount: this.totalAmount,
      notes: this.noteForOrder,
      status: 'pending',
      requestTime: new Date()
    };

    this.isLoading = true;
    this.roomServiceService.createServiceOrder(order).subscribe(
      (newOrder) => {
        this.message.success(this.translate.instant('ROOM_SERVICE.MESSAGES.ORDER_SUCCESS'));
        this.isLoading = false;
        this.clearCart();
        this.loadServiceOrders();
      },
      (error) => {
        this.message.error(this.translate.instant('ROOM_SERVICE.MESSAGES.ORDER_ERROR', { message: error.message }));
        this.isLoading = false;
      }
    );
  }

  // ===== Quản lý đơn hàng =====

  loadServiceOrders(): void {
    if (!this.roomId) return;

    this.isLoading = true;
    this.roomServiceService.getServiceOrdersByRoom(this.roomId).subscribe(
      (data) => {
        this.serviceOrders = data;
        this.isLoading = false;
      },
      (error) => {
        this.message.error(this.translate.instant('ROOM_SERVICE.MESSAGES.HISTORY_LOAD_ERROR', { message: error.message }));
        this.isLoading = false;
      }
    );
  }

  cancelOrder(orderId: string): void {
    this.modal.confirm({
      nzTitle: 'Xác nhận hủy đơn hàng',
      nzContent: 'Bạn có chắc chắn muốn hủy đơn hàng này?',
      nzOkText: 'Hủy đơn',
      nzOkType: 'primary',
      nzOnOk: () => {
        this.isLoading = true;
        this.roomServiceService.updateServiceOrderStatus(orderId, 'cancelled').subscribe(
          () => {
            this.message.success(this.translate.instant('ROOM_SERVICE.MESSAGES.CANCEL_SUCCESS'));
            this.isLoading = false;
            this.loadServiceOrders();
          },
          (error) => {
            this.message.error(this.translate.instant('ROOM_SERVICE.MESSAGES.CANCEL_ERROR', { message: error.message }));
            this.isLoading = false;
          }
        );
      }
    });
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'pending':
        return 'gold';
      case 'processing':
        return 'blue';
      case 'completed':
        return 'green';
      case 'cancelled':
        return 'red';
      default:
        return 'default';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'pending':
        return 'Đang chờ';
      case 'processing':
        return 'Đang xử lý';
      case 'completed':
        return 'Hoàn thành';
      case 'cancelled':
        return 'Đã hủy';
      default:
        return 'Không xác định';
    }
  }

  toggleDisplayOrders(): void {
    this.displayOrders = !this.displayOrders;
    if (this.displayOrders) {
      this.loadServiceOrders();
    }
  }

  formatCurrency(amount: number | undefined): string {
    if (amount === undefined) {
      return this.formatterVND(0);
    }
    return this.formatterVND(amount);
  }

  formatterVND = (value: number): string => `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} đ`;
  
  parserVND = (value: string): string => value.replace(/\s?đ/g, '').replace(/,/g, '');
} 