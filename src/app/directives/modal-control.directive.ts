import { Directive, HostListener, Input, OnInit, OnDestroy } from '@angular/core';
import { NzModalService, NzModalRef } from 'ng-zorro-antd/modal';
import { RoomsService } from '../services/rooms.service';
import { InvoiceService } from '../services/invoice.service';
import { take, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { RoomContentModalComponent } from '../components/room-content-modal/room-content-modal.component';
import { InvoiceComponent } from '../components/invoice/invoice.component';
import { BookingModalComponent } from '../components/booking-modal/booking-modal.component';
import { Room } from '../interfaces/rooms';

@Directive({
  selector: '[appModalControl]',
  exportAs: 'appModalControl'
})
export class ModalControlDirective implements OnInit, OnDestroy {
  @Input() room!: Room; // Phòng được truyền vào directive
  private destroy$ = new Subject<void>();
  private modalRef: NzModalRef | null = null;
  private contextMenuModalRef: NzModalRef | null = null;
  private isModalOpening = false; // Flag để tránh mở modal nhiều lần
  private clickEventHandlers: Map<string, (e: Event) => void> = new Map(); // Lưu handlers để có thể remove
  newRoom: any;
  constructor(
    private modalService: NzModalService,
    private roomsService: RoomsService,
    private invoiceService: InvoiceService
  ) {}

  ngOnInit(): void {
    // Khởi tạo nếu cần
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('click', ['$event']) 
  onClick(event: MouseEvent): void {
    // Kiểm tra xem click có phải từ button trong context menu không
    const target = event.target as HTMLElement;
    if (target.closest('.ant-modal') || target.closest('.list-group-item')) {
      // Nếu click vào modal hoặc button trong context menu, không xử lý
      return;
    }
    
    if (this.room && !this.isModalOpening && !this.modalRef) {
      const modalType = this.getModalType();
      this.showModal(this.room, modalType);
    }
  }

  @HostListener('contextmenu', ['$event']) 
  onContextMenu(event: MouseEvent) {
    event.preventDefault();
    if (this.room) {
      this.showContextMenu(event);
    }
  }

  // Hiển thị menu ngữ cảnh khi nhấp chuột phải
  showContextMenu(event: MouseEvent): void {
    const status = this.room.status;
    const isOccupied = status === 'occupied';
    const isVacant = status === 'vacant';
    const isDirty = status === 'dirty' || status === 'cleaning';
    const isBooked = status === 'booked';
    
    // Tính toán vị trí hiển thị menu
    const menuX = event.clientX;
    const menuY = event.clientY;
    
    // Tạo và hiển thị menu tùy chọn - Bootstrap Style
    this.contextMenuModalRef = this.modalService.create({
      nzTitle: `Phòng ${this.room.roomNumber} - Tùy chọn`,
      nzContent: `
        <div class="list-group list-group-flush">
          ${isOccupied ? `
            <a class="list-group-item list-group-item-action d-flex align-items-center" id="checkout-btn">
              <span class="badge bg-success rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              </span>
              <span class="flex-grow-1">Trả phòng</span>
              <span class="badge bg-success-subtle text-success">Checkout</span>
            </a>
            <div class="list-group-item bg-light py-1 px-3">
              <small class="text-muted fw-semibold text-uppercase">Thông tin</small>
            </div>
            <a class="list-group-item list-group-item-action d-flex align-items-center" id="guest-info-btn">
              <span class="badge bg-primary rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              </span>
              <span class="flex-grow-1">Thông tin khách</span>
            </a>
            <a class="list-group-item list-group-item-action d-flex align-items-center" id="save-guest-info-btn">
              <span class="badge bg-info rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
              </span>
              <span class="flex-grow-1">Lưu thông tin khách</span>
            </a>
            <a class="list-group-item list-group-item-action d-flex align-items-center" id="service-btn">
              <span class="badge bg-info rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-9-5l1.1-2h7.45c.75 0 1.41-.41 1.75-1.03L21.7 4H5.21l-.94-2H1v2h2l3.6 7.59L3.62 17H19v-2H7v-2z"/></svg>
              </span>
              <span class="flex-grow-1">Cập nhật dịch vụ</span>
            </a>
            <div class="list-group-item bg-light py-1 px-3">
              <small class="text-muted fw-semibold text-uppercase">Thao tác</small>
            </div>
            <a class="list-group-item list-group-item-action d-flex align-items-center" id="transfer-btn">
              <span class="badge bg-warning text-dark rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>
              </span>
              <span class="flex-grow-1">Đổi phòng</span>
            </a>
            <a class="list-group-item list-group-item-action d-flex align-items-center" id="guest-out-btn">
              <span class="badge bg-secondary rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5a2 2 0 00-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z"/></svg>
              </span>
              <span class="flex-grow-1">Khách ra ngoài</span>
              <span class="text-muted">›</span>
            </a>
          ` : ''}
          
          ${isVacant ? `
            <a class="list-group-item list-group-item-action d-flex align-items-center" id="checkin-btn">
              <span class="badge bg-success rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
              </span>
              <span class="flex-grow-1">Nhận phòng</span>
              <span class="badge bg-success-subtle text-success">Check-in</span>
            </a>
            <a class="list-group-item list-group-item-action d-flex align-items-center" id="booking-btn">
              <span class="badge bg-primary rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
              </span>
              <span class="flex-grow-1">Đặt phòng</span>
            </a>
          ` : ''}
          
          ${isBooked ? `
            <a class="list-group-item list-group-item-action d-flex align-items-center" id="checkin-btn">
              <span class="badge bg-success rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
              </span>
              <span class="flex-grow-1">Nhận phòng (đã đặt)</span>
              <span class="badge bg-success-subtle text-success">Check-in</span>
            </a>
            <a class="list-group-item list-group-item-action d-flex align-items-center" id="guest-info-btn">
              <span class="badge bg-primary rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              </span>
              <span class="flex-grow-1">Thông tin đặt phòng</span>
            </a>
            <a class="list-group-item list-group-item-action d-flex align-items-center text-danger" id="cancel-booking-btn">
              <span class="badge bg-danger rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </span>
              <span class="flex-grow-1">Hủy đặt phòng</span>
            </a>
          ` : ''}
          
          ${isDirty ? `
            <a class="list-group-item list-group-item-action d-flex align-items-center" id="clean-btn">
              <span class="badge bg-success rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              </span>
              <span class="flex-grow-1">Đã dọn xong</span>
              <span class="badge bg-success">✓</span>
            </a>
          ` : ''}
          
          <div class="list-group-item bg-light py-1 px-3">
            <small class="text-muted fw-semibold text-uppercase">Trạng thái</small>
          </div>
          <a class="list-group-item list-group-item-action d-flex align-items-center" id="dirty-btn">
            <span class="badge bg-warning text-dark rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16z"/><circle cx="12" cy="12" r="4"/></svg>
            </span>
            <span class="flex-grow-1">Báo bẩn</span>
          </a>
          <a class="list-group-item list-group-item-action d-flex align-items-center" id="maintenance-btn">
            <span class="badge bg-secondary rounded-circle me-3 d-flex align-items-center justify-content-center" style="width:32px;height:32px;">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M22.7 19l-9.1-9.1a6 6 0 00-1.5-6.9 6 6 0 00-7.4-1.3L9 6 6 9 1.6 4.7A6 6 0 002.9 12.1a6 6 0 006.9 1.5l9.1 9.1a1 1 0 001.4 0l2.3-2.3a1 1 0 00.1-1.4z"/></svg>
            </span>
            <span class="flex-grow-1">Sửa phòng</span>
          </a>
        </div>
        <style>
          .context-menu-modal .ant-modal-content {
            box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
            border-radius: 0.5rem;
            border: 1px solid rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .context-menu-modal .ant-modal-header {
            padding: 0.75rem 1rem;
            background: #212529;
            border-bottom: none;
          }
          .context-menu-modal .ant-modal-title {
            font-size: 0.875rem;
            font-weight: 600;
            color: #fff;
            text-align: center;
          }
          .context-menu-modal .ant-modal-close {
            top: 0.5rem;
            right: 0.5rem;
          }
          .context-menu-modal .ant-modal-close-x {
            width: 1.5rem;
            height: 1.5rem;
            line-height: 1.5rem;
            font-size: 0.875rem;
            color: rgba(255,255,255,0.75);
            border-radius: 0.25rem;
          }
          .context-menu-modal .ant-modal-close:hover .ant-modal-close-x {
            color: #fff;
            background: rgba(255,255,255,0.1);
          }
          .context-menu-modal .ant-modal-body {
            padding: 0 !important;
            background: #fff;
          }
          .list-group { margin: 0; }
          .list-group-item {
            padding: 0.625rem 1rem;
            border-left: 0;
            border-right: 0;
            border-color: #f0f0f0;
            font-size: 0.875rem;
            cursor: pointer;
            transition: all 0.15s ease-in-out;
          }
          .list-group-item:first-child { border-top: 0; }
          .list-group-item:last-child { border-bottom: 0; }
          .list-group-item-action:hover {
            background-color: #f8f9fa;
            color: #0d6efd;
          }
          .list-group-item-action:active {
            background-color: #e9ecef;
          }
          .badge {
            font-weight: 500;
          }
          .bg-success-subtle { background-color: #d1e7dd !important; }
          .me-3 { margin-right: 0.75rem !important; }
          .flex-grow-1 { flex-grow: 1 !important; }
          .d-flex { display: flex !important; }
          .align-items-center { align-items: center !important; }
          .justify-content-center { justify-content: center !important; }
          .fw-semibold { font-weight: 600 !important; }
          .text-uppercase { text-transform: uppercase !important; }
          .bg-light { background-color: #f8f9fa !important; }
          .py-1 { padding-top: 0.25rem !important; padding-bottom: 0.25rem !important; }
          .px-3 { padding-left: 1rem !important; padding-right: 1rem !important; }
          .rounded-circle { border-radius: 50% !important; }
          .bg-success { background-color: #198754 !important; color: #fff; }
          .bg-primary { background-color: #0d6efd !important; color: #fff; }
          .bg-info { background-color: #0dcaf0 !important; color: #000; }
          .bg-warning { background-color: #ffc107 !important; }
          .bg-danger { background-color: #dc3545 !important; color: #fff; }
          .bg-secondary { background-color: #6c757d !important; color: #fff; }
          .text-success { color: #198754 !important; }
          .text-danger { color: #dc3545 !important; }
          .text-muted { color: #6c757d !important; }
          .text-dark { color: #212529 !important; }
        </style>
      `,
      nzFooter: null,
      nzMaskClosable: true,
      nzClosable: true,
      nzMask: true,
      nzMaskStyle: { backgroundColor: 'rgba(0,0,0,0.25)' },
      nzWidth: 280,
      nzBodyStyle: { padding: '0' },
      nzClassName: 'context-menu-modal',
      nzStyle: { 
        position: 'fixed',
        top: `${menuY}px`,
        left: `${menuX}px`,
        margin: '0',
        padding: '0'
      },
      nzZIndex: 99999
    });

    // Đăng ký các sự kiện cho các nút trong menu
    this.contextMenuModalRef.afterOpen.subscribe(() => {
      // Sử dụng setTimeout để đảm bảo DOM đã render
      setTimeout(() => {
        // Tìm tất cả modal đang mở và lấy modal cuối cùng (context menu)
        const allModals = document.querySelectorAll('.ant-modal');
        const modalElement = allModals[allModals.length - 1] as HTMLElement;
        
        if (!modalElement) {
          console.error('Không tìm thấy modal element');
          return;
        }
        
        // Hàm helper để gắn event listener
        const attachClickEvent = (selector: string, handler: () => void) => {
          const btn = modalElement.querySelector(selector);
          if (btn) {
            // Remove event listener cũ nếu có
            const oldHandler = this.clickEventHandlers.get(selector);
            if (oldHandler) {
              btn.removeEventListener('click', oldHandler);
            }
            
            // Tạo handler mới
            const newHandler = (e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation(); // Ngăn các handler khác
              
              // Đóng context menu trước
              if (this.contextMenuModalRef) {
                this.contextMenuModalRef.close();
                this.contextMenuModalRef = null;
              }
              
              // Đợi một chút để đảm bảo context menu đã đóng
              setTimeout(() => {
                handler();
              }, 100);
            };
            
            // Lưu handler để có thể remove sau
            this.clickEventHandlers.set(selector, newHandler);
            btn.addEventListener('click', newHandler, { once: true }); // once: true để chỉ chạy 1 lần
          }
        };
        
        // Gắn event cho các nút
        attachClickEvent('#checkout-btn', () => this.showModal(this.room, 'checkout'));
        attachClickEvent('#guest-info-btn', () => this.showGuestInfoModal());
        attachClickEvent('#save-guest-info-btn', () => this.showSaveGuestInfoModal());
        attachClickEvent('#service-btn', () => this.showServiceModal());
        attachClickEvent('#transfer-btn', () => this.showTransferModal());
        attachClickEvent('#checkin-btn', () => this.showCheckinModal());
        attachClickEvent('#booking-btn', () => this.showBookingModal());
        attachClickEvent('#clean-btn', () => this.markRoomAsClean());
        attachClickEvent('#dirty-btn', () => this.markRoomAsDirty());
        attachClickEvent('#maintenance-btn', () => this.markRoomAsMaintenance());
        attachClickEvent('#guest-out-btn', () => this.showGuestOutModal());
        attachClickEvent('#cancel-booking-btn', () => this.cancelBooking());
      }, 100);
    });
  }
  
  // Hiển thị modal khách ra ngoài
  showGuestOutModal(): void {
    this.modalService.confirm({
      nzTitle: `Khách ra ngoài - Phòng ${this.room.roomNumber}`,
      nzContent: `
        <div style="margin-bottom: 16px;">
          <p>Xác nhận khách tạm thời ra ngoài. Phòng vẫn được giữ và tính phí.</p>
          <input type="text" id="guestOutNote" placeholder="Ghi chú (không bắt buộc)" 
            style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
        </div>
      `,
      nzOkText: 'Xác nhận',
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        const noteInput = document.getElementById('guestOutNote') as HTMLInputElement;
        const note = noteInput ? noteInput.value : '';
        
        this.roomsService.guestOut(this.room._id, note)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.modalService.success({
                nzTitle: 'Thành công',
                nzContent: `Đã ghi nhận khách phòng ${this.room.roomNumber} tạm ra ngoài.`,
                nzOkText: 'Đóng'
              });
              this.roomsService.notifyRoomDataUpdated();
            },
            error: (err) => {
              this.modalService.error({
                nzTitle: 'Lỗi',
                nzContent: err.error?.message || 'Không thể cập nhật trạng thái.',
                nzOkText: 'Đóng'
              });
            }
          });
      }
    });
  }
  
  // Hủy đặt phòng
  cancelBooking(): void {
    this.modalService.confirm({
      nzTitle: 'Xác nhận hủy đặt phòng',
      nzContent: `
        <div style="margin-bottom: 16px;">
          <p>Bạn có chắc chắn muốn hủy đặt phòng ${this.room.roomNumber}?</p>
          <input type="text" id="cancelReason" placeholder="Lý do hủy (không bắt buộc)" 
            style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
        </div>
      `,
      nzOkText: 'Hủy đặt phòng',
      nzOkDanger: true,
      nzCancelText: 'Không',
      nzOnOk: () => {
        const reasonInput = document.getElementById('cancelReason') as HTMLInputElement;
        const reason = reasonInput ? reasonInput.value : 'Hủy từ context menu';
        
        this.roomsService.cancelBooking(this.room._id, reason)
          .pipe(take(1))
          .subscribe({
            next: () => {
              // Xóa dữ liệu đặt phòng khỏi localStorage
              localStorage.removeItem(`booking_${this.room._id}`);
              
              this.modalService.success({
                nzTitle: 'Thành công',
                nzContent: 'Đã hủy đặt phòng thành công.',
                nzOkText: 'Đóng'
              });
              this.roomsService.notifyRoomDataUpdated();
            },
            error: (err) => {
              this.modalService.error({
                nzTitle: 'Lỗi',
                nzContent: err.error?.message || 'Không thể hủy đặt phòng.',
                nzOkText: 'Đóng'
              });
            }
          });
      }
    });
  }
  
  // Hiển thị modal thông tin khách
  showGuestInfoModal(): void {
    // Lấy từ room.events nếu có
    let guestInfo: any = {};
    let checkinTime: Date | null = null;
    let rateType: string = '';
    let advancePayment: number = 0;
    
    if (this.room.events && this.room.events.length > 0) {
      const checkinEvents = this.room.events.filter(e => e.type === 'checkin');
      if (checkinEvents.length > 0) {
        const lastCheckin = checkinEvents[checkinEvents.length - 1];
        guestInfo = lastCheckin.guestInfo || {};
        checkinTime = lastCheckin.checkinTime ? new Date(lastCheckin.checkinTime) : null;
        rateType = lastCheckin.rateType || '';
        advancePayment = lastCheckin.advancePayment || 0;
      }
    }
    
    // Fallback: lấy từ localStorage
    if (!guestInfo.name) {
      const savedCheckinData = localStorage.getItem(`checkin_${this.room._id}`);
      if (savedCheckinData) {
        try {
          const checkinData = JSON.parse(savedCheckinData);
          guestInfo = checkinData.guestInfo || {};
          checkinTime = checkinData.checkinTime ? new Date(checkinData.checkinTime) : null;
          rateType = checkinData.rateType || '';
          advancePayment = checkinData.advancePayment || 0;
        } catch (e) {
          console.error('Error parsing checkin data:', e);
        }
      }
    }
    
    const rateTypeLabels: {[key: string]: string} = {
      'hourly': 'Theo giờ',
      'daily': 'Ngày đêm',
      'nightly': 'Qua đêm'
    };
    
    const formatCurrency = (amount: number) => new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
    const formatDateTime = (date: Date | null) => date ? 
      `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}` 
      : 'Chưa có';
    
    this.modalService.info({
      nzTitle: `Thông tin khách - Phòng ${this.room.roomNumber}`,
      nzContent: `
        <div style="line-height: 1.8; font-size: 14px;">
          <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
            <p style="margin: 0;"><strong>👤 Tên khách:</strong> ${guestInfo.name || 'Chưa có thông tin'}</p>
          </div>
          <p><strong>📞 Số điện thoại:</strong> ${guestInfo.phone || 'Chưa có'}</p>
          <p><strong>🪪 CCCD/CMND:</strong> ${guestInfo.idNumber || 'Chưa có'}</p>
          <p><strong>📧 Email:</strong> ${guestInfo.email || 'Chưa có'}</p>
          <p><strong>📍 Địa chỉ:</strong> ${guestInfo.address || 'Chưa có'}</p>
          <hr style="border: none; border-top: 1px dashed #d9d9d9; margin: 12px 0;" />
          <p><strong>🕐 Nhận phòng:</strong> ${formatDateTime(checkinTime)}</p>
          <p><strong>💰 Loại giá:</strong> ${rateTypeLabels[rateType] || 'Chưa xác định'}</p>
          <p><strong>💵 Đặt trước:</strong> ${advancePayment > 0 ? formatCurrency(advancePayment) : 'Không'}</p>
        </div>
      `,
      nzOkText: 'Đóng',
      nzWidth: 450
    });
  }
  
  // Hiển thị modal lưu thông tin khách
  showSaveGuestInfoModal(): void {
    // Lấy thông tin khách hiện tại từ room.events hoặc localStorage
    let guestInfo: any = {};
    let advancePayment: number = 0;
    
    if (this.room.events && this.room.events.length > 0) {
      const checkinEvents = this.room.events.filter((e: any) => e.type === 'checkin');
      if (checkinEvents.length > 0) {
        const lastCheckin = checkinEvents[checkinEvents.length - 1];
        guestInfo = lastCheckin.guestInfo || {};
        advancePayment = lastCheckin.advancePayment || 0;
      }
    }
    
    // Fallback: lấy từ localStorage
    if (!guestInfo.name || guestInfo.name === 'Khách lẻ') {
      const savedCheckinData = localStorage.getItem(`checkin_${this.room._id}`);
      if (savedCheckinData) {
        try {
          const checkinData = JSON.parse(savedCheckinData);
          guestInfo = checkinData.guestInfo || {};
          advancePayment = checkinData.advancePayment || 0;
        } catch (e) {
          console.error('Error parsing checkin data:', e);
        }
      }
    }
    
    this.modalService.create({
      nzTitle: `Lưu thông tin khách - Phòng ${this.room.roomNumber}`,
      nzContent: `
        <div style="margin-bottom: 16px;">
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Tên khách:</label>
            <input type="text" id="guest-name" value="${guestInfo.name || 'Khách lẻ'}" 
              placeholder="Nhập tên khách (mặc định: Khách lẻ)"
              style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Số điện thoại:</label>
            <input type="text" id="guest-phone" value="${guestInfo.phone || ''}" 
              placeholder="Nhập số điện thoại"
              style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">CCCD/CMND:</label>
            <input type="text" id="guest-id" value="${guestInfo.idNumber || ''}" 
              placeholder="Nhập số CCCD/CMND"
              style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Email:</label>
            <input type="email" id="guest-email" value="${guestInfo.email || ''}" 
              placeholder="Nhập email"
              style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Địa chỉ:</label>
            <input type="text" id="guest-address" value="${guestInfo.address || ''}" 
              placeholder="Nhập địa chỉ"
              style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Tiền đặt trước:</label>
            <input type="number" id="advance-payment" value="${advancePayment || 0}" 
              placeholder="Nhập số tiền đặt trước"
              min="0"
              style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
          </div>
        </div>
      `,
      nzOkText: 'Lưu',
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        const nameInput = document.getElementById('guest-name') as HTMLInputElement;
        const phoneInput = document.getElementById('guest-phone') as HTMLInputElement;
        const idInput = document.getElementById('guest-id') as HTMLInputElement;
        const emailInput = document.getElementById('guest-email') as HTMLInputElement;
        const addressInput = document.getElementById('guest-address') as HTMLInputElement;
        const advanceInput = document.getElementById('advance-payment') as HTMLInputElement;
        
        const updatedGuestInfo = {
          name: (nameInput?.value || 'Khách lẻ').trim(),
          phone: phoneInput?.value || '',
          idNumber: idInput?.value || '',
          email: emailInput?.value || '',
          address: addressInput?.value || ''
        };
        
        const updatedAdvancePayment = advanceInput ? parseFloat(advanceInput.value) || 0 : 0;
        
        // Lấy thông tin check-in hiện tại
        const savedCheckinData = localStorage.getItem(`checkin_${this.room._id}`);
        let checkinData: any = {
          roomId: this.room._id,
          roomNumber: this.room.roomNumber,
          checkinTime: new Date(),
          guestInfo: updatedGuestInfo,
          advancePayment: updatedAdvancePayment
        };
        
        if (savedCheckinData) {
          try {
            const existingData = JSON.parse(savedCheckinData);
            checkinData = {
              ...existingData,
              guestInfo: updatedGuestInfo,
              advancePayment: updatedAdvancePayment
            };
          } catch (e) {
            console.error('Error parsing existing checkin data:', e);
          }
        }
        
        // Lưu vào localStorage
        localStorage.setItem(`checkin_${this.room._id}`, JSON.stringify(checkinData));
        
        // Cập nhật vào room.events nếu có event checkin
        if (this.room.events && this.room.events.length > 0) {
          const checkinEvents = this.room.events.filter((e: any) => e.type === 'checkin');
          if (checkinEvents.length > 0) {
            // Cập nhật event checkin với thông tin mới qua API
            this.roomsService.updateRoomCheckinInfo(
              this.room._id,
              updatedGuestInfo,
              updatedAdvancePayment
            ).pipe(take(1)).subscribe({
              next: () => {
                this.modalService.success({
                  nzTitle: 'Thành công',
                  nzContent: 'Đã lưu thông tin khách và tiền đặt trước.',
                  nzOkText: 'Đóng'
                });
                this.roomsService.notifyRoomDataUpdated();
              },
              error: (err) => {
                // Nếu API không có, vẫn báo thành công vì đã lưu vào localStorage
                this.modalService.success({
                  nzTitle: 'Thành công',
                  nzContent: 'Đã lưu thông tin khách và tiền đặt trước vào bộ nhớ tạm.',
                  nzOkText: 'Đóng'
                });
                this.roomsService.notifyRoomDataUpdated();
              }
            });
            return;
          }
        }
        
        // Nếu không có event checkin, chỉ lưu vào localStorage
        this.modalService.success({
          nzTitle: 'Thành công',
          nzContent: 'Đã lưu thông tin khách và tiền đặt trước vào bộ nhớ tạm.',
          nzOkText: 'Đóng'
        });
      }
    });
  }
  
  // Hiển thị modal cập nhật dịch vụ
  showServiceModal(): void {
    // Mở modal checkout để cập nhật dịch vụ
    this.showModal(this.room, 'checkout');
  }
  
  // Hiển thị modal đặt phòng trước
  showBookingModal(): void {
    let bookingModalRef: NzModalRef | null = null;
    bookingModalRef = this.modalService.create({
      nzTitle: `Đặt phòng ${this.room.roomNumber}`,
      nzContent: BookingModalComponent,
      nzData: {
        selectedDate: new Date(),
        hotelId: this.room.hotelId,
        roomId: this.room._id,
        rooms: [this.room] // Chỉ hiển thị phòng hiện tại
      },
      nzFooter: [
        {
          label: 'Hủy',
          onClick: () => bookingModalRef?.close()
        },
        {
          label: 'Xuất PDF xác nhận',
          onClick: () => {
            const instance = bookingModalRef?.getContentComponent() as BookingModalComponent;
            if (instance) {
              instance.exportConfirmationPDF();
            }
          }
        },
        {
          label: 'Đặt phòng',
          type: 'primary',
          onClick: () => {
            const instance = bookingModalRef?.getContentComponent() as BookingModalComponent;
            if (instance) {
              instance.onSubmit();
            }
          }
        }
      ],
      nzWidth: 800,
      nzMaskClosable: false
    });
    
    bookingModalRef.afterClose.subscribe((result) => {
      if (result?.success) {
        this.roomsService.notifyRoomDataUpdated();
      }
    });
  }
  
  // Đánh dấu phòng đã dọn xong
  markRoomAsClean(): void {
    this.roomsService.cleanRoom(this.room._id, { status: 'vacant' })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.modalService.success({
            nzTitle: 'Thành công',
            nzContent: `Phòng ${this.room.roomNumber} đã sẵn sàng đón khách.`,
            nzOkText: 'Đóng'
          });
          this.roomsService.notifyRoomDataUpdated();
          // Đảm bảo đóng context menu nếu còn mở
          if (this.contextMenuModalRef) {
            this.contextMenuModalRef.close();
            this.contextMenuModalRef = null;
          }
        },
        error: (err) => {
          this.modalService.error({
            nzTitle: 'Lỗi',
            nzContent: err.error?.error || 'Không thể cập nhật trạng thái phòng.',
            nzOkText: 'Đóng'
          });
        }
      });
  }
  
  // Đánh dấu phòng bẩn
  markRoomAsDirty(): void {
    this.roomsService.updateRoomStatus(
      this.room._id,
      'dirty',
      localStorage.getItem('staffId') || 'unknown',
      'Báo bẩn từ menu'
    ).pipe(take(1)).subscribe({
      next: () => {
        this.modalService.success({
          nzTitle: 'Thành công',
          nzContent: `Đã báo phòng ${this.room.roomNumber} cần dọn dẹp.`,
          nzOkText: 'Đóng'
        });
        this.roomsService.notifyRoomDataUpdated();
      },
      error: (err) => {
        this.modalService.error({
          nzTitle: 'Lỗi',
          nzContent: err.error?.error || 'Không thể cập nhật trạng thái phòng.',
          nzOkText: 'Đóng'
        });
      }
    });
  }
  
  // Đánh dấu phòng cần sửa
  markRoomAsMaintenance(): void {
    this.roomsService.updateRoomStatus(
      this.room._id,
      'maintenance',
      localStorage.getItem('staffId') || 'unknown',
      'Báo sửa phòng từ menu'
    ).pipe(take(1)).subscribe({
      next: () => {
        this.modalService.success({
          nzTitle: 'Thành công',
          nzContent: `Đã báo phòng ${this.room.roomNumber} cần bảo trì.`,
          nzOkText: 'Đóng'
        });
        this.roomsService.notifyRoomDataUpdated();
      },
      error: (err) => {
        this.modalService.error({
          nzTitle: 'Lỗi',
          nzContent: err.error?.error || 'Không thể cập nhật trạng thái phòng.',
          nzOkText: 'Đóng'
        });
      }
    });
  }

  // Hiển thị modal nhận phòng
  showCheckinModal(): void {
    // Kiểm tra xem modal đã được mở chưa
    if (this.isModalOpening || this.modalRef) {
      console.log('Modal đang được mở, bỏ qua yêu cầu mở modal mới');
      return;
    }
    
    const status = this.room.status;
    if (status !== 'vacant') {
      this.modalService.info({
        nzTitle: 'Thông báo',
        nzContent: `Chỉ có thể nhận phòng khi phòng đang trống. Trạng thái hiện tại: ${this.getStatusLabel(status)}`,
        nzOkText: 'Đóng'
      });
      return;
    }
    
    this.isModalOpening = true;
    
    // Đóng context menu nếu đang mở
    if (this.contextMenuModalRef) {
      this.contextMenuModalRef.close();
      this.contextMenuModalRef = null;
    }
    
    this.modalRef = this.modalService.create({
      nzTitle: 'Nhận Phòng',
      nzContent: RoomContentModalComponent,
      nzData: {
        roomData: this.room,
        skipValidation: false,
        modalType: 'checkin'
      },
      nzWidth: 800,
      nzFooter: null,
      nzMaskClosable: false,
      nzClosable: true
    });
    
    this.modalRef.afterClose.pipe(
      take(1),
      takeUntil(this.destroy$)
    ).subscribe((result: any) => {
      // Reset flag trước
      this.isModalOpening = false;
      const closedModalRef = this.modalRef;
      this.modalRef = null;
      
      // Lưu thông tin checkin để sử dụng khi checkout nếu có kết quả trả về
      if (result && result.checkinInfo) {
        // Lưu thông tin vào localStorage hoặc service
        const checkinData = {
          roomId: this.room._id,
          roomNumber: this.room.roomNumber,
          checkinTime: result.checkinInfo.checkinTime || new Date(),
          guestInfo: result.checkinInfo.guestInfo || {},
          paymentMethod: result.checkinInfo.paymentMethod || 'cash',
          rateType: result.checkinInfo.rateType || 'hourly',
          advancePayment: result.checkinInfo.advancePayment || 0,
          selectedServices: result.checkinInfo.selectedServices || [],
          notes: result.checkinInfo.notes || ''
        };
        
        // Lưu thông tin vào localStorage
        localStorage.setItem(`checkin_${this.room._id}`, JSON.stringify(checkinData));
      }
      
      // Delay notify để tránh trigger mở modal lại
      setTimeout(() => {
        // Chỉ notify nếu modal đã thực sự đóng và không có modal mới được mở
        if (!this.modalRef && closedModalRef) {
          this.roomsService.notifyRoomDataUpdated();
        }
      }, 200);
    });
  }

  // Helper: Lấy label cho trạng thái phòng
  getStatusLabel(status: string): string {
    const labels: {[key: string]: string} = {
      'vacant': 'Trống',
      'occupied': 'Đang sử dụng',
      'dirty': 'Cần dọn dẹp',
      'cleaning': 'Đang dọn dẹp', 
      'maintenance': 'Bảo trì'
    };
    return labels[status] || status;
  }

  // Hiển thị modal chuyển phòng
  showTransferModal(): void {
    const status = this.room.status;
    if (status !== 'occupied') {
      this.modalService.info({
        nzTitle: 'Thông báo',
        nzContent: `Chỉ có thể chuyển phòng khi phòng đang có khách. Trạng thái hiện tại: ${this.getStatusLabel(status)}`,
        nzOkText: 'Đóng'
      });
      return;
    }
    
    // Lấy danh sách phòng trống
    this.roomsService.getAvailableRooms({ hotelId: this.room.hotelId }).pipe(
      take(1),
      takeUntil(this.destroy$)
    ).subscribe(
      (availableRooms) => {
        const filteredRooms = availableRooms.filter(r => r._id !== this.room._id);
        
        if (filteredRooms.length === 0) {
          this.modalService.info({
            nzTitle: 'Thông báo',
            nzContent: 'Không có phòng trống nào để chuyển đến.',
            nzOkText: 'Đóng'
          });
          return;
        }
        
        // Hiển thị modal chọn phòng đích
        this.modalRef = this.modalService.create({
          nzTitle: `Chuyển từ phòng ${this.room.roomNumber}`,
          nzContent: `
            <div class="transfer-form">
              <div class="form-item">
                <label for="target-room">Chọn phòng đích:</label>
                <select id="target-room" class="form-control">
                  ${filteredRooms.map(room => `<option value="${room._id}">${room.roomNumber} - ${room.type}</option>`).join('')}
                </select>
              </div>
              <div class="form-item">
                <label for="transfer-note">Ghi chú:</label>
                <textarea id="transfer-note" class="form-control" rows="3" placeholder="Lý do chuyển phòng..."></textarea>
              </div>
            </div>
            <style>
              .transfer-form {
                display: flex;
                flex-direction: column;
                gap: 15px;
              }
              .form-item {
                display: flex;
                flex-direction: column;
                gap: 5px;
              }
              .form-control {
                padding: 8px;
                border: 1px solid #d9d9d9;
                border-radius: 4px;
              }
            </style>
          `,
          nzFooter: [
            {
              label: 'Hủy',
              onClick: () => this.modalRef?.close()
            },
            {
              label: 'Xác nhận',
              type: 'primary',
              onClick: () => {
                const modalElement = document.getElementsByClassName('ant-modal')[0] as HTMLElement;
                const targetRoomSelect = modalElement.querySelector('#target-room') as HTMLSelectElement;
                const transferNote = modalElement.querySelector('#transfer-note') as HTMLTextAreaElement;
                
                if (targetRoomSelect && targetRoomSelect.value) {
                  const notes = transferNote?.value || 'Chuyển phòng';
                  this.roomsService.transferRoom(
                    this.room._id,
                    targetRoomSelect.value,
                    localStorage.getItem('staffId') || 'unknown',
                    notes
                  ).pipe(
                    take(1),
                    takeUntil(this.destroy$)
                  ).subscribe(
                    (response) => {
                      this.modalRef?.close();
                      this.modalService.success({
                        nzTitle: 'Thành công',
                        nzContent: `Đã chuyển khách từ phòng ${this.room.roomNumber} sang phòng ${response.targetRoom.roomNumber}`,
                        nzOkText: 'Đóng'
                      });
                      this.roomsService.notifyRoomDataUpdated();
                    },
                    (error) => {
                      this.modalService.error({
                        nzTitle: 'Lỗi',
                        nzContent: error.error?.error || 'Không thể chuyển phòng, vui lòng thử lại sau.',
                        nzOkText: 'Đóng'
                      });
                    }
                  );
                }
              }
            }
          ]
        });
      },
      (error) => {
        this.modalService.error({
          nzTitle: 'Lỗi',
          nzContent: 'Không thể lấy danh sách phòng trống.',
          nzOkText: 'Đóng'
        });
      }
    );
  }

  // Hiển thị modal cập nhật trạng thái
  showStatusUpdateModal(): void {
    const currentStatus = this.room.status;
    
    // Tạo danh sách trạng thái có thể chuyển đổi dựa trên trạng thái hiện tại
    let availableStatuses = [
      { value: 'vacant', label: 'Trống' },
      { value: 'dirty', label: 'Cần dọn dẹp' },
      { value: 'cleaning', label: 'Đang dọn dẹp' },
      { value: 'maintenance', label: 'Bảo trì' }
    ];
    
    // Nếu đang ở trạng thái occupied, chỉ cho phép giữ nguyên
    if (currentStatus === 'occupied') {
      this.modalService.info({
        nzTitle: 'Thông báo',
        nzContent: 'Phòng đang có khách sử dụng. Để thay đổi trạng thái, vui lòng thực hiện trả phòng trước.',
        nzOkText: 'Đóng'
      });
      return;
    }
    
    this.modalRef = this.modalService.create({
      nzTitle: `Cập nhật trạng thái phòng ${this.room.roomNumber}`,
      nzContent: `
        <div class="status-form">
          <div class="form-item">
            <label for="room-status">Trạng thái mới:</label>
            <select id="room-status" class="form-control">
              ${availableStatuses.map(status => 
                `<option value="${status.value}" ${currentStatus === status.value ? 'selected' : ''}>${status.label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-item">
            <label for="status-note">Ghi chú:</label>
            <textarea id="status-note" class="form-control" rows="3" placeholder="Lý do thay đổi trạng thái..."></textarea>
          </div>
        </div>
        <style>
          .status-form {
            display: flex;
            flex-direction: column;
            gap: 15px;
          }
          .form-item {
            display: flex;
            flex-direction: column;
            gap: 5px;
          }
          .form-control {
            padding: 8px;
            border: 1px solid #d9d9d9;
            border-radius: 4px;
          }
        </style>
      `,
      nzFooter: [
        {
          label: 'Hủy',
          onClick: () => this.modalRef?.close()
        },
        {
          label: 'Xác nhận',
          type: 'primary',
          onClick: () => {
            const modalElement = document.getElementsByClassName('ant-modal')[0] as HTMLElement;
            const statusSelect = modalElement.querySelector('#room-status') as HTMLSelectElement;
            const statusNote = modalElement.querySelector('#status-note') as HTMLTextAreaElement;
            
            if (statusSelect && statusSelect.value && statusSelect.value !== currentStatus) {
              // Cập nhật UI để hiển thị loading
              const confirmBtn = modalElement.querySelector('.ant-btn-primary') as HTMLButtonElement;
              if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i class="ant-loader-icon"></i> Đang xử lý...';
              }
              
              this.roomsService.updateRoomStatus(
                this.room._id,
                statusSelect.value as Room['status'],
                localStorage.getItem('staffId') || 'unknown',
                statusNote?.value || ''
              ).pipe(
                take(1),
                takeUntil(this.destroy$)
              ).subscribe(
                (response) => {
                  this.modalRef?.close();
                  
                  // Hiển thị thông báo thành công với thêm chi tiết
                  const statusLabels: {[key: string]: string} = {
                    'vacant': 'Trống',
                    'dirty': 'Cần dọn dẹp', 
                    'maintenance': 'Bảo trì',
                    'occupied': 'Đang sử dụng'
                  };
                  
                  this.modalService.success({
                    nzTitle: 'Thành công',
                    nzContent: `Đã cập nhật trạng thái phòng ${this.room.roomNumber} thành "${statusLabels[statusSelect.value] || statusSelect.value}"`,
                    nzOkText: 'Đóng'
                  });
                  this.roomsService.notifyRoomDataUpdated();
                },
                (error) => {
                  this.modalService.error({
                    nzTitle: 'Lỗi',
                    nzContent: error.error?.error || 'Không thể cập nhật trạng thái phòng, vui lòng thử lại sau.',
                    nzOkText: 'Đóng'
                  });
                  
                  // Khôi phục nút khi có lỗi
                  if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = 'Xác nhận';
                  }
                }
              );
            } else {
              this.modalRef?.close();
            }
          }
        }
      ]
    });
  }

  showModal(room: Room, type: string): void {
    console.log(`Hiển thị modal với type: ${type} cho phòng ${room.roomNumber}`);
    
    // Kiểm tra xem modal đang được mở không
    if (this.isModalOpening) {
      console.log('Modal đang được mở, bỏ qua yêu cầu mở modal mới');
      return;
    }
    
    // Đóng context menu nếu đang mở
    if (this.contextMenuModalRef) {
      this.contextMenuModalRef.close();
      this.contextMenuModalRef = null;
    }
    
    // Đóng modal cũ nếu còn mở
    if (this.modalRef) {
      this.modalRef.close();
      this.modalRef = null;
    }
    
    this.isModalOpening = true;
    
    // Reload room từ backend để đảm bảo dữ liệu mới nhất
    this.roomsService.getRoomById(room._id).subscribe({
      next: (updatedRoom) => {
        this.modalRef = this.modalService.create({
          nzTitle: `Phòng ${updatedRoom.roomNumber}`,
          nzContent: RoomContentModalComponent,
          nzFooter: null,
          nzMaskClosable: false,
          nzClassName: 'room-detail-modal',
          nzWidth: 700,
          nzData: {
            roomData: updatedRoom,
            modalType: type
          }
        });

        // Đảm bảo modal được đóng sau khi hoàn tất
        if (this.modalRef) {
          this.modalRef.afterClose.pipe(
            take(1),
            takeUntil(this.destroy$)
          ).subscribe(() => {
            // Reset flag trước
            this.isModalOpening = false;
            const closedModalRef = this.modalRef;
            this.modalRef = null;
            
            // Delay notify để tránh trigger mở modal lại
            setTimeout(() => {
              // Chỉ notify nếu modal đã thực sự đóng và không có modal mới được mở
              if (!this.modalRef && closedModalRef) {
                this.roomsService.notifyRoomDataUpdated();
              }
            }, 200);
          });
        }
      },
      error: (err) => {
        this.isModalOpening = false;
        console.error('Error reloading room before opening modal:', err);
        // Fallback: sử dụng room data đã có
        this.modalRef = this.modalService.create({
          nzTitle: `Phòng ${room.roomNumber}`,
          nzContent: RoomContentModalComponent,
          nzFooter: null,
          nzMaskClosable: false,
          nzClassName: 'room-detail-modal',
          nzWidth: 700,
          nzData: {
            roomData: room,
            modalType: type
          }
        });

        // Đảm bảo modal được đóng sau khi hoàn tất
        if (this.modalRef) {
          this.modalRef.afterClose.pipe(
            take(1),
            takeUntil(this.destroy$)
          ).subscribe(() => {
            // Reset flag trước
            this.isModalOpening = false;
            const closedModalRef = this.modalRef;
            this.modalRef = null;
            
            // Delay notify để tránh trigger mở modal lại
            setTimeout(() => {
              // Chỉ notify nếu modal đã thực sự đóng và không có modal mới được mở
              if (!this.modalRef && closedModalRef) {
                this.roomsService.notifyRoomDataUpdated();
              }
            }, 200);
          });
        }
      }
    });
  }

  handleLabel(): string {
    const status = this.room.status;
    switch (status) {
      case 'vacant':
        return 'Nhận Phòng';
      case 'occupied':
        return 'Trả Phòng';
      case 'dirty':
      case 'cleaning':
        return 'Dọn Dẹp';
      case 'maintenance':
        return 'Bảo Trì';
      default:
        return 'Xem Chi Tiết';
    }
  }

  // Xác định loại modal dựa trên trạng thái phòng
  getModalType(): string {
    const status = this.room.status;
    
    switch (status) {
      case 'vacant':
        return 'checkin';
      case 'occupied':
        return 'checkout';
      case 'dirty':
      case 'cleaning':
      case 'maintenance':
        return 'cleaning'; 
      default:
        console.warn(`Trạng thái phòng không xác định: ${status}. Mở modal thông tin mặc định.`);
        return 'info';
    }
  }

  // Xác định tiêu đề modal dựa trên trạng thái phòng
  getModalTitle(): string {
    const status = this.room.status;
    switch (status) {
      case 'vacant':
        return 'Nhận Phòng';
      case 'occupied':
        return 'Trả Phòng';
      case 'dirty':
      case 'cleaning':
        return 'Dọn Dẹp/Sẵn Sàng'; 
      case 'maintenance':
        return 'Bảo Trì';
      default:
        return 'Thông Tin Phòng';
    }
  }

  handleCheck(): void {
    if (!this.room || !this.room._id) {
      console.warn('Invalid room or room ID provided.');
      this.modalRef?.close();
      return;
    }
  
    const lastEvent = this.room.events && this.room.events.length > 0 
      ? this.room.events[this.room.events.length - 1] 
      : null;
    
    const status = this.room.status;
  
    if (status === 'vacant') {
      
      // Room is available, perform check-in
      this.newRoom = {
        status: 'occupied',
        events: [
          ...(this.room.events || []),
          {
            type: 'checkin',
            checkinTime: new Date(),
          },
        ],
      };
      this.roomsService.checkInRoom(this.room._id, this.newRoom)
      .pipe(take(1))
      .subscribe(
        (room) => {
          console.log('Check-in/out successful. Room:', room);
          this.roomsService.notifyRoomDataUpdated();
          this.modalRef?.close();
        },
        (error) => {
          console.error('Error during check-in/out:', error);
          this.modalRef?.close();
        }
      );
    } else if (status === 'occupied' && lastEvent && lastEvent.type === 'checkin') {
      // Room is active and last event is check-in, perform check-out    
      const updatedLastEvent = {
        ...lastEvent,
        type: 'checkout',
        checkoutTime: new Date(),
        payment: this.calculatePayment(lastEvent.checkinTime, new Date(), this.room.type)
      };
  
      this.newRoom = {
        status: 'dirty',
        events: [
          ...(this.room.events || []).slice(0, -1),
          updatedLastEvent,
          {
            type: 'checkout',
            checkoutTime: new Date(),
            payment: updatedLastEvent.payment,
          },
        ]
      };
      
      this.roomsService.checkOutRoom(this.room._id, this.newRoom)
      .pipe(take(1))
      .subscribe(
        (room) => {
          console.log('Check-in/out successful. Room:', room);
          this.roomsService.notifyRoomDataUpdated();
          const invoiceData = this.generateInvoice(this.room.roomNumber.toString());
          this.showInvoice(invoiceData);
          this.modalRef?.close();
        },
        (error) => {
          console.error('Error during check-in/out:', error);
          this.modalRef?.close();
        }
      );
    } else if((status === 'dirty' || status === 'cleaning') && lastEvent && lastEvent.type === 'checkout'){
      this.newRoom = {
        status: 'vacant',
      };
      this.roomsService.cleanRoom(this.room._id, this.newRoom)
      .pipe(take(1))
      .subscribe(
        (room) => {
          console.log('Clean successful. Room:', room);
          this.roomsService.notifyRoomDataUpdated();
          this.modalRef?.close();
        },
        (error) => {
          console.error('Error during check-in/out:', error);
          this.modalRef?.close();
        }
      );
    } else {
      // Handle other cases as needed
      console.warn('Invalid room status or room not in a check-in state for check-in/check-out.');
      this.modalRef?.close();
      return;
    }
  }

  calculatePayment(checkinTime: any, checkoutTime: any, roomType: any): number {
    if (!checkinTime || !checkoutTime) {
      return 0;
    }

      // Chuyển đổi chuỗi ngày thành đối tượng Date
      const checkinDate = new Date(checkinTime);
      const checkoutDate = new Date(checkoutTime);
      
    // Tính thời gian sử dụng phòng
      const durationInHours = Math.ceil((checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60));
    const durationInDays = Math.ceil(durationInHours / 24);
    
    // Lấy thông tin check-in/check-out
    const checkInHour = checkinDate.getHours();
    const checkOutHour = checkoutDate.getHours();
    const isWeekend = [0, 6].includes(checkinDate.getDay()); // Kiểm tra có phải cuối tuần (thứ 7, chủ nhật)
    
    // Biến lưu kết quả
    let roomTotal = 0;
    let serviceTotal = 0;
    let additionalCharge = 0;
    let discount = 0;
    
    // --- TÍNH GIÁ PHÒNG ---
    // Xác định loại giá (hourly, daily, nightly)
    let rateType = 'hourly'; // Mặc định theo giờ
    
    // Nếu check-in sau 22h, sử dụng giá đêm
    if (checkInHour >= 22) {
      rateType = 'nightly';
    }
    
    // Nếu thời gian lưu trú > 12 giờ, sử dụng giá ngày
    if (durationInHours > 12) {
      rateType = 'daily';
    }
    
    // Tính giá dựa theo loại giá
    switch (rateType) {
      case 'hourly':
        // Giá giờ đầu
        roomTotal = this.room.pricing?.hourly || this.room.firstHourRate || 0;
        
        // Tính giá cho các giờ tiếp theo
        if (durationInHours > 1) {
          const additionalHours = durationInHours - 1;
          const additionalHourRate = this.room.additionalHourRate || (this.room.pricing?.hourly ? this.room.pricing.hourly * 0.8 : 0);
          roomTotal += additionalHours * additionalHourRate;
        }
        
        // Nếu số giờ vượt quá 6 giờ, chuyển sang tính ngày
        if (durationInHours > 6) {
          roomTotal = this.room.pricing?.daily || 0;
        }
        break;
        
      case 'daily':
        // Tính số ngày (làm tròn lên)
        roomTotal = durationInDays * (this.room.pricing?.daily || 0);
        
        // Phụ thu cuối tuần nếu có
        if (isWeekend) {
          // Giả sử phụ thu là 20% cho cuối tuần
          additionalCharge += roomTotal * 0.2;
        }
        break;
        
      case 'nightly':
        // Giá qua đêm
        roomTotal = this.room.pricing?.nightly || 0;
        
        // Nếu ở nhiều hơn 1 đêm
        if (durationInDays > 1) {
          roomTotal += (durationInDays - 1) * (this.room.pricing?.daily || 0);
        }
        break;
    }
    
    // --- TÍNH TIỀN DỊCH VỤ ---
    const savedCheckinData = localStorage.getItem(`checkin_${this.room._id}`);
    if (savedCheckinData) {
      try {
        const checkinInfo = JSON.parse(savedCheckinData);
        if (checkinInfo.selectedServices && Array.isArray(checkinInfo.selectedServices) && checkinInfo.selectedServices.length > 0) {
          // Tính tổng tiền dịch vụ
          serviceTotal = checkinInfo.selectedServices.reduce((sum: number, service: any) => {
            return sum + (service.price * (service.quantity || 1));
          }, 0);
        }
        
        // Lấy phụ thu từ thông tin check-in (nếu có)
        if (checkinInfo.additionalCharges) {
          additionalCharge += checkinInfo.additionalCharges;
        }
        
        // Lấy giảm giá từ thông tin check-in (nếu có)
        if (checkinInfo.discount) {
          discount += checkinInfo.discount;
        }
      } catch (error) {
        console.error('Lỗi khi tính tiền dịch vụ:', error);
      }
    }
    
    // --- TÍNH KHUYẾN MÃI ---
    // Khuyến mãi theo thời gian lưu trú (ví dụ: giảm 10% nếu ở từ 3 ngày trở lên)
    if (durationInDays >= 3) {
      discount += roomTotal * 0.1;
    }
    
    // --- TÍNH PHỤ THU ---
    // Phụ thu trả phòng muộn (nếu trả phòng sau 12h trưa và trước 18h)
    if (checkOutHour > 12 && checkOutHour < 18 && rateType !== 'hourly') {
      // Phụ thu 50% giá giờ
      additionalCharge += (this.room.pricing?.hourly || 0) * 0.5;
    }
    
    // --- TÍNH TỔNG TIỀN ---
    const totalPrice = roomTotal + serviceTotal + additionalCharge - discount;
    
    return Math.max(0, Math.round(totalPrice)); // Đảm bảo không âm và làm tròn
  }

  // Hàm generateInvoice mới
  generateInvoice(roomNumber: string): any {
    if (!this.room || !this.room._id) {
      console.warn('Không có thông tin phòng hợp lệ để tạo hóa đơn.');
      return null;
    }
    
    // Tìm event check-in và check-out mới nhất
    let checkinEvent, checkoutEvent;
    
    if (this.room.events && this.room.events.length > 0) {
      checkinEvent = this.room.events.find((event: any) => event.type === 'checkin');
      checkoutEvent = this.room.events.find((event: any) => event.type === 'checkout');
    }
    
    // Lấy thông tin lưu trữ từ localStorage nếu có
    const savedCheckinData = localStorage.getItem(`checkin_${this.room._id}`);
    let checkinInfo = null;
    
    if (savedCheckinData) {
      try {
        checkinInfo = JSON.parse(savedCheckinData);
      } catch (error) {
        console.error('Lỗi khi phân tích dữ liệu check-in:', error);
      }
    }
    
    // Tính thời gian sử dụng
    const checkInTime = new Date(checkinEvent?.checkinTime || checkinInfo?.checkinTime || new Date());
    const checkOutTime = new Date(checkoutEvent?.checkoutTime || new Date());
    const durationInHours = Math.ceil((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60));
    const durationInDays = Math.ceil(durationInHours / 24);
    
    // Tính tiền phòng và dịch vụ
    const roomTotal = checkoutEvent?.payment || this.calculatePayment(checkInTime, checkOutTime, this.room.type);
    let serviceTotal = 0;
    let additionalCharges = checkinInfo?.additionalCharges || 0;
    let discount = checkinInfo?.discount || 0;
    let selectedServices = [];
    
    // Tính tiền dịch vụ
    if (checkinInfo?.selectedServices && Array.isArray(checkinInfo.selectedServices)) {
      selectedServices = checkinInfo.selectedServices;
      serviceTotal = checkinInfo.selectedServices.reduce((sum: number, service: any) => {
        return sum + (service.price * (service.quantity || 1));
      }, 0);
    }
    
    // Tính tổng tiền
    const totalAmount = roomTotal + serviceTotal + additionalCharges - discount;
    
    // Tạo dữ liệu hóa đơn
    const invoiceData: any = {
      invoiceNumber: 'INV-' + new Date().getTime(),
      date: new Date(),
      customerName: checkinInfo?.guestInfo?.name || 'Khách lẻ',
      customerPhone: checkinInfo?.guestInfo?.phone || '',
      customerEmail: checkinInfo?.guestInfo?.email || '',
      staffName: localStorage.getItem('staffName') || 'Nhân viên',
      roomNumber: roomNumber,
      roomType: this.room.type || 'Phòng thường',
      checkInTime: checkInTime,
      checkOutTime: checkOutTime,
      duration: {
        hours: durationInHours,
        days: durationInDays
      },
      
      // Thông tin tài chính
      roomAmount: roomTotal,
      serviceAmount: serviceTotal,
      additionalCharges: additionalCharges,
      discount: discount,
      totalAmount: totalAmount,
      paymentMethod: checkinInfo?.paymentMethod || 'cash',
      advancePayment: checkinInfo?.advancePayment || 0,
      
      // Thông tin khách sạn
      hotelId: this.room.hotelId,
      
      // Thông tin dịch vụ
      products: []
    };
    
    // Thêm sản phẩm/dịch vụ tiền phòng
    invoiceData.products.push({
      name: `Tiền phòng ${roomNumber}`,
      price: roomTotal,
      quantity: 1
    });
    
    // Thêm các dịch vụ đã sử dụng
    if (selectedServices.length > 0) {
      const services = selectedServices.map((service: any) => ({
        name: service.serviceName || 'Dịch vụ',
        price: service.price || 0,
        quantity: service.quantity || 1
      }));
      
      invoiceData.products = [...invoiceData.products, ...services];
    }
    
    // Thêm thông tin khách hàng
    invoiceData.guestDetails = checkinInfo?.guestInfo || {};
    
    return invoiceData;
  }

  // Hiển thị hóa đơn
  showInvoice(invoiceData: any): void {
    // Đảm bảo dữ liệu đầy đủ trước khi hiển thị
    let formattedInvoiceData: any = {
      invoiceNumber: invoiceData.invoiceNumber || invoiceData._id || 'INV-' + new Date().getTime(),
      date: invoiceData.date || invoiceData.checkOutTime || new Date(),
      customerName: invoiceData.customerName || invoiceData.guestDetails?.name || 'Khách lẻ',
      customerPhone: invoiceData.customerPhone || invoiceData.guestDetails?.phone || 'Không có thông tin',
      customerEmail: invoiceData.customerEmail || invoiceData.guestDetails?.email || 'Không có thông tin',
      staffName: invoiceData.staffName || 'Nhân viên',
      roomNumber: invoiceData.roomNumber || invoiceData.roomId?.roomNumber || 'N/A',
      roomType: invoiceData.roomType || 'Phòng thường',
      checkInTime: invoiceData.checkInTime || invoiceData.checkInDate || invoiceData.actualCheckInTime,
      checkOutTime: invoiceData.checkOutTime || invoiceData.checkOutDate || invoiceData.actualCheckOutTime || new Date(),
      
      // Xử lý sản phẩm/dịch vụ đã sử dụng
      products: invoiceData.products || [
        { 
          name: `Tiền phòng ${invoiceData.roomNumber || 'N/A'}`, 
          price: invoiceData.amount || 0,
          quantity: 1
        }
      ],
      
      // Xử lý dịch vụ thêm
      additionalServices: invoiceData.additionalServices || invoiceData.services || [],
      
      // Thông tin tài chính
      roomAmount: invoiceData.roomAmount || invoiceData.amount || 0,
      serviceAmount: invoiceData.serviceAmount || 0,
      additionalCharges: invoiceData.additionalCharges || 0,
      discount: invoiceData.discount || 0,
      totalAmount: invoiceData.totalAmount || invoiceData.amount || 0,
      paymentMethod: invoiceData.paymentMethod || invoiceData.paymentDetails?.paymentMethod || 'cash',
      paymentStatus: invoiceData.paymentStatus || invoiceData.paymentDetails?.paymentStatus || 'paid',
      
      // Thông tin business
      businessName: invoiceData.businessName || invoiceData.hotelName || 'Khách sạn',
      business_address: invoiceData.business_address || invoiceData.hotelAddress || '',
      phoneNumber: invoiceData.phoneNumber || invoiceData.hotelPhone || '',
      
      // Thông tin khách sạn và phòng
      hotelId: invoiceData.hotelId || this.room?.hotelId,
      
      // Thông tin bổ sung về lưu trú
      duration: invoiceData.duration || { hours: 0, days: 0 },
      
      // Thông tin booking
      bookingId: invoiceData.bookingId || '',
      
      // Thông tin khách hàng đầy đủ
      guestDetails: invoiceData.guestInfo || invoiceData.guestDetails || {},
      
      // Thanh toán trước
      advancePayment: invoiceData.advancePayment || 0,
      
      // Hình thức tính tiền
      rateType: invoiceData.rateType || 'hourly'
    };

    // Lấy thông tin checkin từ localStorage nếu có
    const roomId = this.room?._id || invoiceData.roomId;
    const savedCheckinData = localStorage.getItem(`checkin_${roomId}`);
    
    if (savedCheckinData) {
      try {
        const checkinInfo = JSON.parse(savedCheckinData);
        
        // Cập nhật thông tin từ checkin vào invoice
        formattedInvoiceData = {
          ...formattedInvoiceData,
          checkInTime: checkinInfo.checkinTime || formattedInvoiceData.checkInTime,
          customerName: checkinInfo.guestInfo?.name || formattedInvoiceData.customerName,
          customerPhone: checkinInfo.guestInfo?.phone || formattedInvoiceData.customerPhone, 
          paymentMethod: checkinInfo.paymentMethod || formattedInvoiceData.paymentMethod,
          advancePayment: checkinInfo.advancePayment || 0,
          rateType: checkinInfo.rateType || 'hourly'
        };
        
        // Lưu thông tin khách hàng đầy đủ
        if (checkinInfo.guestInfo) {
          formattedInvoiceData.guestDetails = checkinInfo.guestInfo;
        }
        
        // Tính thời gian lưu trú
        if (formattedInvoiceData.checkInTime && formattedInvoiceData.checkOutTime) {
          const checkInTime = new Date(formattedInvoiceData.checkInTime);
          const checkOutTime = new Date(formattedInvoiceData.checkOutTime);
          const durationInHours = Math.ceil((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60));
          
          formattedInvoiceData.duration = {
            hours: durationInHours,
            days: Math.ceil(durationInHours / 24)
          };
        }
        
        // Thêm dịch vụ đã sử dụng trong checkin
        if (checkinInfo.selectedServices && Array.isArray(checkinInfo.selectedServices) && checkinInfo.selectedServices.length > 0) {
          // Chuyển đổi dịch vụ từ checkinInfo sang định dạng product
          const serviceProducts = checkinInfo.selectedServices.map((service: any) => ({
            name: service.serviceName || 'Dịch vụ',
            price: service.price || 0,
            quantity: service.quantity || 1
          }));
          
          // Cập nhật danh sách products
          formattedInvoiceData.products = [
            ...formattedInvoiceData.products, 
            ...serviceProducts
          ];
        }
        
        // Sau khi checkout thành công, xóa thông tin checkin khỏi localStorage
        if (invoiceData.checkOutTime) {
          localStorage.removeItem(`checkin_${roomId}`);
        }
      } catch (error) {
        console.error('Lỗi khi phân tích dữ liệu checkin:', error);
      }
    }

    // Chuẩn bị danh sách sản phẩm với định dạng phù hợp
    const prepareProductsList = () => {
      // Đảm bảo products luôn là một mảng
      if (!Array.isArray(formattedInvoiceData.products)) {
        formattedInvoiceData.products = [];
      }
      
      // Thêm tiền phòng nếu chưa có trong danh sách
      if (formattedInvoiceData.products.length === 0 && formattedInvoiceData.roomAmount > 0) {
        formattedInvoiceData.products.push({
          name: `Tiền phòng ${formattedInvoiceData.roomNumber}`,
          price: formattedInvoiceData.roomAmount,
          quantity: 1
        });
      }
      
      // Thêm các dịch vụ đã sử dụng vào danh sách sản phẩm
      if (Array.isArray(formattedInvoiceData.additionalServices) && formattedInvoiceData.additionalServices.length > 0) {
        formattedInvoiceData.additionalServices.forEach((service: any) => {
          formattedInvoiceData.products.push({
            name: service.name || 'Dịch vụ',
            price: service.price || 0,
            quantity: service.quantity || 1
          });
        });
      }
      
      return formattedInvoiceData.products;
    };
    
    // Cập nhật danh sách sản phẩm
    formattedInvoiceData.products = prepareProductsList();

    // Nếu có hotel ID nhưng không có thông tin business, tải thông tin từ API
    if (formattedInvoiceData.hotelId && 
        (!formattedInvoiceData.businessName || formattedInvoiceData.businessName === 'Khách sạn')) {
      
      // Gọi service để lấy thông tin khách sạn
      this.roomsService.getHotelInfo(formattedInvoiceData.hotelId).pipe(
        take(1),
        takeUntil(this.destroy$)
      ).subscribe(
        (hotelInfo) => {
          if (hotelInfo) {
            formattedInvoiceData.businessName = hotelInfo.name || 'Khách sạn';
            formattedInvoiceData.business_address = hotelInfo.address || '';
            formattedInvoiceData.phoneNumber = hotelInfo.phoneNumber || '';
            
            this.createInvoiceModal(formattedInvoiceData);
          } else {
            this.createInvoiceModal(formattedInvoiceData);
          }
        },
        () => {
          this.createInvoiceModal(formattedInvoiceData);
        }
      );
    } else {
      this.createInvoiceModal(formattedInvoiceData);
    }
  }

  // Tạo modal hóa đơn
  private createInvoiceModal(invoiceData: any): void {
    // Đảm bảo hotelId luôn có trong invoiceData
    if (!invoiceData.hotelId) {
      invoiceData.hotelId = this.room?.hotelId || 
                            localStorage.getItem('selectedHotelId') || 
                            localStorage.getItem('hotelId');
    }
    
    // Lưu hóa đơn vào database trước khi hiển thị
    this.saveInvoiceToDatabase(invoiceData).then((savedInvoice) => {
      // Cập nhật invoiceData với thông tin từ database nếu có
      if (savedInvoice && savedInvoice.data) {
        invoiceData = {
          ...invoiceData,
          _id: savedInvoice.data._id,
          invoiceNumber: savedInvoice.data.invoiceNumber || invoiceData.invoiceNumber,
          businessInfo: savedInvoice.data.businessInfo || invoiceData.businessInfo,
          hotelId: savedInvoice.data.hotelId || invoiceData.hotelId // Đảm bảo hotelId không bị mất
        };
      }
      
      // Hiển thị modal hóa đơn
      this.modalService.create({
        nzTitle: 'Hóa Đơn Thanh Toán',
        nzContent: InvoiceComponent,
        nzData: {
          invoiceData: invoiceData
        },
        nzWidth: 800,
        nzFooter: null,
        nzMaskClosable: false,
        nzClassName: 'invoice-modal'
      });
    }).catch((error) => {
      console.error('Lỗi khi lưu hóa đơn:', error);
      // Đảm bảo hotelId vẫn có trong invoiceData khi lưu thất bại
      if (!invoiceData.hotelId) {
        invoiceData.hotelId = this.room?.hotelId || 
                              localStorage.getItem('selectedHotelId') || 
                              localStorage.getItem('hotelId');
      }
      // Vẫn hiển thị modal ngay cả khi lưu thất bại
      this.modalService.create({
        nzTitle: 'Hóa Đơn Thanh Toán',
        nzContent: InvoiceComponent,
        nzData: {
          invoiceData: invoiceData
        },
        nzWidth: 800,
        nzFooter: null,
        nzMaskClosable: false,
        nzClassName: 'invoice-modal'
      });
    });
  }
  
  // Lưu hóa đơn vào database
  private async saveInvoiceToDatabase(invoiceData: any): Promise<any> {
    try {
      // Chuẩn bị dữ liệu để gửi lên server
      const invoicePayload = {
        invoiceNumber: invoiceData.invoiceNumber,
        hotelId: invoiceData.hotelId || this.room?.hotelId,
        roomId: this.room?._id,
        roomNumber: invoiceData.roomNumber || this.room?.roomNumber,
        roomType: invoiceData.roomType || this.room?.type,
        bookingId: invoiceData.bookingId || '',
        customerName: invoiceData.customerName || invoiceData.guestDetails?.name || 'Khách lẻ',
        customerPhone: invoiceData.customerPhone || invoiceData.guestDetails?.phone || '',
        customerEmail: invoiceData.customerEmail || invoiceData.guestDetails?.email || '',
        guestDetails: invoiceData.guestDetails || invoiceData.guestInfo || {},
        staffId: invoiceData.staffId || localStorage.getItem('staffId') || '',
        staffName: invoiceData.staffName || localStorage.getItem('staffName') || 'Nhân viên',
        checkInTime: invoiceData.checkInTime || invoiceData.checkInDate,
        checkOutTime: invoiceData.checkOutTime || invoiceData.checkOutDate || new Date(),
        duration: invoiceData.duration || { hours: 0, days: 0 },
        rateType: invoiceData.rateType || 'hourly',
        products: invoiceData.products || [],
        roomAmount: invoiceData.roomAmount || invoiceData.amount || 0,
        serviceAmount: invoiceData.serviceAmount || 0,
        additionalCharges: invoiceData.additionalCharges || 0,
        discount: invoiceData.discount || 0,
        advancePayment: invoiceData.advancePayment || 0,
        totalAmount: invoiceData.totalAmount || invoiceData.amount || 0,
        paymentMethod: invoiceData.paymentMethod || 'cash',
        paymentStatus: invoiceData.paymentStatus || 'paid',
        notes: invoiceData.notes || '',
        status: 'issued',
        date: invoiceData.date || new Date(),
        metadata: invoiceData.metadata || {}
      };
      
      // Gọi API để lưu hóa đơn
      return await this.invoiceService.createInvoice(invoicePayload).pipe(take(1)).toPromise();
    } catch (error) {
      console.error('Error saving invoice to database:', error);
      throw error;
    }
  }
}