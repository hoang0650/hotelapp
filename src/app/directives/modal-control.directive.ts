import { Directive, HostListener, Input, OnInit, OnDestroy } from '@angular/core';
import { NzModalService, NzModalRef } from 'ng-zorro-antd/modal';
import { RoomsService, RoomDataUpdateEvent } from '../services/rooms.service';
import { InvoiceService } from '../services/invoice.service';
import { take, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { RoomContentModalComponent } from '../components/room-content-modal/room-content-modal.component';
import { InvoiceComponent } from '../components/invoice/invoice.component';
import { BookingModalComponent } from '../components/booking-modal/booking-modal.component';
import { RoomContextMenuComponent } from '../components/room-context-menu/room-context-menu.component';
import { GuestSaveModalComponent } from '../components/guest-save-modal/guest-save-modal.component';
import { TransferRoomModalComponent } from '../components/transfer-room-modal/transfer-room-modal.component';
import { Room } from '../interfaces/rooms';
import { TranslateService } from '@ngx-translate/core';
import { HotelService } from '../services/hotel.service';
import { SessionContextService } from '../services/session-context.service';
import { CheckinCacheService } from '../services/checkin-cache.service';

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
  private isMobileDeviceCached: boolean | null = null;
  newRoom: any;
  constructor(
    private modalService: NzModalService,
    private roomsService: RoomsService,
    private invoiceService: InvoiceService,
    private translate: TranslateService,
    private hotelService: HotelService,
    private sessionContext: SessionContextService,
    private checkinCache: CheckinCacheService
  ) {}

  ngOnInit(): void {
    this.isMobileDeviceCached = this.isMobileDevice();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private extractHotelId(room: Room = this.room): string {
    const raw = room?.hotelId as any;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (raw && typeof raw === 'object') {
      const id = raw._id || raw.id;
      if (id) return String(id);
    }
    return this.sessionContext.getSelectedHotelId() || '';
  }

  /** Cập nhật sơ đồ theo từng phòng — không force reload cả khách sạn. */
  private notifyRoomChanged(
    reason: RoomDataUpdateEvent['reason'] = 'generic',
    options?: {
      relatedRoomId?: string;
      refreshHistory?: boolean;
      refreshRooms?: boolean;
      delayMs?: number;
      roomId?: string;
    }
  ): void {
    const roomId = options?.roomId || this.room?._id;
    if (!roomId) return;
    const statusOnly =
      reason === 'dirty' ||
      reason === 'status' ||
      reason === 'cleaning' ||
      reason === 'maintenance' ||
      reason === 'guest_out' ||
      reason === 'guest_return' ||
      reason === 'transfer';
    this.roomsService.notifyRoomDataUpdated({
      hotelId: this.extractHotelId() || undefined,
      roomId,
      relatedRoomId: options?.relatedRoomId,
      reason,
      // Status-only: đã optimistic local — không GET /rooms/:id nặng
      refreshRooms: options?.refreshRooms ?? !statusOnly,
      refreshHistory: options?.refreshHistory ?? !statusOnly,
      force: false,
      delayMs: options?.delayMs ?? 0
    });
  }

  private applyLocalRoomStatus(status: Room['status']): void {
    if (!this.room) return;
    this.room.status = status;
    if (status === 'vacant' || status === 'dirty' || status === 'maintenance' || status === 'cleaning') {
      this.room.guestStatus = undefined;
      if (status === 'vacant' || status === 'maintenance') {
        this.room.events = [];
        this.room.currentBooking = undefined as any;
      }
    }
    const hotelId = this.extractHotelId();
    if (hotelId && this.room._id) {
      this.roomsService.patchCachedRoom(hotelId, this.room);
    }
  }

  // Kiểm tra xem có phải thiết bị mobile không
  private isMobileDevice(): boolean {
    if (this.isMobileDeviceCached !== null) {
      return this.isMobileDeviceCached;
    }

    if (typeof window === 'undefined') return false;
    
    // Kiểm tra user agent
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    
    // Kiểm tra touch support
    const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Kiểm tra kích thước màn hình
    const isSmallScreen = window.innerWidth <= 768;
    
    this.isMobileDeviceCached = mobileRegex.test(userAgent) || (hasTouchScreen && isSmallScreen);
    return this.isMobileDeviceCached;
  }

  @HostListener('click', ['$event']) 
  onClick(event: MouseEvent): void {
    // Kiểm tra xem click có phải từ button trong context menu không
    const target = event.target as HTMLElement;
    if (target.closest('.ant-modal') || target.closest('.list-group-item')) {
      // Nếu click vào modal hoặc button trong context menu, không xử lý
      return;
    }
    
    // Nếu là mobile, hiển thị context menu thay vì mở modal
    if (this.isMobileDevice()) {
      event.preventDefault();
      event.stopPropagation();
      if (this.room && !this.contextMenuModalRef) {
        this.showContextMenu(event);
      }
      return;
    }
    
    // Trên PC: giữ nguyên logic mở modal
    if (this.room && !this.isModalOpening && !this.modalRef) {
      const modalType = this.getModalType();
      this.showModal(this.room, modalType);
    }
  }

  @HostListener('contextmenu', ['$event']) 
  onContextMenu(event: MouseEvent) {
    // Trên mobile, không xử lý contextmenu (đã xử lý trong onClick)
    if (this.isMobileDevice()) {
      return;
    }
    
    event.preventDefault();
    if (this.room) {
      this.showContextMenu(event);
    }
  }

  // Hiển thị menu ngữ cảnh khi nhấp chuột phải (PC) hoặc click (Mobile)
  showContextMenu(event: MouseEvent | TouchEvent): void {
    const isMobile = this.isMobileDevice();
    
    // Tính toán vị trí hiển thị menu
    let menuX: number;
    let menuY: number;
    
    if (isMobile) {
      // Trên mobile: hiển thị ở giữa màn hình
      menuX = window.innerWidth / 2;
      menuY = window.innerHeight / 2;
    } else {
      // Trên PC: hiển thị tại vị trí click
      menuX = (event as MouseEvent).clientX;
      menuY = (event as MouseEvent).clientY;
    }
    
    // Tạo và hiển thị menu tùy chọn sử dụng component
    const modalConfig: any = {
      nzTitle: `Phòng ${this.room.roomNumber} - Tùy chọn`,
      nzContent: RoomContextMenuComponent,
      nzData: {
        room: this.room
      },
      nzFooter: null,
      nzMaskClosable: true,
      nzClosable: true,
      nzMask: true,
      nzMaskStyle: { backgroundColor: 'rgba(0,0,0,0.25)' },
      nzWidth: isMobile ? Math.min(320, window.innerWidth - 40) : 280,
      nzBodyStyle: { padding: '0' },
      nzClassName: 'context-menu-modal',
      nzZIndex: 99999
    };
    
    if (isMobile) {
      // Trên mobile: căn giữa màn hình
      modalConfig.nzStyle = {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        margin: '0',
        padding: '0',
        maxWidth: '90vw',
        maxHeight: '90vh'
      };
    } else {
      // Trên PC: hiển thị tại vị trí click
      modalConfig.nzStyle = {
        position: 'fixed',
        top: `${menuY}px`,
        left: `${menuX}px`,
        margin: '0',
        padding: '0'
      };
    }
    
    this.contextMenuModalRef = this.modalService.create(modalConfig);
    this.contextMenuModalRef.afterClose.pipe(
      take(1),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.contextMenuModalRef = null;
    });

    // Lắng nghe event từ component
    this.contextMenuModalRef.afterOpen.subscribe(() => {
      const componentInstance = this.contextMenuModalRef?.getContentComponent();
      if (componentInstance && componentInstance instanceof RoomContextMenuComponent) {
        componentInstance.actionSelected.pipe(
          take(1),
          takeUntil(this.destroy$)
        ).subscribe((action: string) => {
          // Đóng context menu
          if (this.contextMenuModalRef) {
            this.contextMenuModalRef.close();
            this.contextMenuModalRef = null;
          }
          
          // Xử lý action tương ứng
          Promise.resolve().then(() => {
            this.handleContextMenuAction(action);
          });
        });
      }
    });
  }

  // Xử lý các action từ context menu
  private handleContextMenuAction(action: string): void {
    switch (action) {
      case 'checkout':
        this.showModal(this.room, 'checkout');
        break;
      case 'guest-info':
        this.showGuestInfoModal();
        break;
      case 'save-guest-info':
        this.showSaveGuestInfoModal();
        break;
      case 'service':
        this.showServiceModal();
        break;
      case 'transfer':
        this.showTransferModal();
        break;
      case 'checkin':
        this.showCheckinModal();
        break;
      case 'booking':
        this.showBookingModal();
        break;
      case 'clean':
        this.markRoomAsClean();
        break;
      case 'dirty':
        this.markRoomAsDirty();
        break;
      case 'maintenance':
        this.markRoomAsMaintenance();
        break;
      case 'guest-out':
        this.showGuestOutModal();
        break;
      case 'guest-return':
        this.showGuestReturnModal();
        break;
      case 'cancel-booking':
        this.cancelBooking();
        break;
      case 'scan-ocr':
        this.showOCRModal();
        break;
      default:
        console.warn('Unknown action:', action);
    }
  }
  
  // Hiển thị modal OCR để quét CCCD/GPLX
  showOCRModal(): void {
    // Lấy thông tin khách từ room nếu có
    let guestInfo = null;
    if (this.room.events && this.room.events.length > 0) {
      const checkinEvents = this.room.events.filter((e: any) => e.type === 'checkin');
      if (checkinEvents.length > 0) {
        const lastCheckin = checkinEvents[checkinEvents.length - 1];
        guestInfo = lastCheckin.guestInfo || null;
      }
    }
    
    // Mở modal GuestSaveModalComponent với OCR
    const modalRef = this.modalService.create({
      nzTitle: 'Quét CCCD/GPLX và lưu thông tin khách',
      nzContent: GuestSaveModalComponent,
      nzFooter: null,
      nzWidth: 900,
      nzMaskClosable: false,
      nzData: {
        room: this.room,
        guestInfo: guestInfo,
        openWithOCR: true // Flag để biết mở từ action OCR
      }
    });
    
    modalRef.afterClose.subscribe((result) => {
      if (result && result.success) {
        this.notifyRoomChanged();
        // Đảm bảo đóng context menu nếu còn mở
        if (this.contextMenuModalRef) {
          this.contextMenuModalRef.close();
          this.contextMenuModalRef = null;
        }
      }
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
        const previousGuestStatus = this.room.guestStatus;
        // Optimistic — cập nhật UI ngay, không chờ API
        this.room.guestStatus = 'out';
        this.notifyRoomChanged('status', { delayMs: 0, refreshRooms: false, refreshHistory: false });

        this.roomsService.guestOut(this.room._id, note)
          .pipe(take(1))
          .subscribe({
            next: (response) => {
              if (response?.room?.guestStatus) {
                this.room.guestStatus = response.room.guestStatus;
              }
            },
            error: (err) => {
              this.room.guestStatus = previousGuestStatus;
              this.notifyRoomChanged('status', { delayMs: 0, refreshRooms: false, refreshHistory: false });
              this.modalService.error({
                nzTitle: 'Lỗi',
                nzContent: err.error?.message || 'Không thể cập nhật trạng thái.',
                nzOkText: 'Đóng'
              });
            }
          });
        return true;
      }
    });
  }
  
  // Hiển thị modal khách quay lại
  showGuestReturnModal(): void {
    this.modalService.confirm({
      nzTitle: `Khách quay lại - Phòng ${this.room.roomNumber}`,
      nzContent: `
        <div style="margin-bottom: 16px;">
          <p>Xác nhận khách đã quay lại phòng.</p>
        </div>
      `,
      nzOkText: 'Xác nhận',
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        const previousGuestStatus = this.room.guestStatus;
        this.room.guestStatus = 'in';
        this.notifyRoomChanged('status', { delayMs: 0, refreshRooms: false, refreshHistory: false });

        this.roomsService.guestReturn(this.room._id)
          .pipe(take(1))
          .subscribe({
            next: (response) => {
              if (response?.room?.guestStatus) {
                this.room.guestStatus = response.room.guestStatus;
              } else {
                this.room.guestStatus = 'in';
              }
            },
            error: (err) => {
              this.room.guestStatus = previousGuestStatus;
              this.notifyRoomChanged('status', { delayMs: 0, refreshRooms: false, refreshHistory: false });
              this.modalService.error({
                nzTitle: 'Lỗi',
                nzContent: err.error?.message || 'Không thể cập nhật trạng thái.',
                nzOkText: 'Đóng'
              });
            }
          });
        return true;
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
              /* booking cache removed — Redis roomSessions */ void this.room._id;
              
              this.modalService.success({
                nzTitle: 'Thành công',
                nzContent: 'Đã hủy đặt phòng thành công.',
                nzOkText: 'Đóng'
              });
              this.notifyRoomChanged();
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
    // Load thông tin phòng mới nhất từ backend để đảm bảo có dữ liệu chính xác
    this.roomsService.getRoomById(this.room._id, { excludeCheckedOut: true }).subscribe({
      next: (roomData) => {
        let guestInfo: any = {};
        let checkinTime: Date | null = null;
        let rateType: string = '';
        let advancePayment: number = 0;
        
        // Lấy từ room events (check-in event chưa được checkout)
        if (roomData.events && roomData.events.length > 0) {
          // Tìm check-in event cuối cùng chưa được checkout
          const checkinEvents = roomData.events.filter((e: any) => e.type === 'checkin');
          if (checkinEvents.length > 0) {
            // Lấy check-in event cuối cùng (chưa được checkout hoặc transfer)
            const lastCheckin = checkinEvents[checkinEvents.length - 1];
            guestInfo = lastCheckin.guestInfo || {};
            checkinTime = lastCheckin.checkinTime ? new Date(lastCheckin.checkinTime) : null;
            rateType = lastCheckin.rateType || '';
            advancePayment = lastCheckin.advancePayment || 0;
          }
        }
        
        // Nếu guestInfo không có name hoặc name là "Khách lẻ", thử lấy từ currentBooking
        if (!guestInfo.name || guestInfo.name === 'Khách lẻ') {
          if (roomData.currentBooking && typeof roomData.currentBooking === 'object') {
            const currentBooking = roomData.currentBooking;
            if (currentBooking.guestInfo?.name && currentBooking.guestInfo.name !== 'Khách lẻ') {
              guestInfo = {
                ...guestInfo,
                name: currentBooking.guestInfo.name,
                phone: currentBooking.guestInfo.phone || guestInfo.phone,
                email: currentBooking.guestInfo.email || guestInfo.email,
                idNumber: currentBooking.guestInfo.idNumber || guestInfo.idNumber,
                address: currentBooking.guestInfo.address || guestInfo.address
              };
            }
          }
        }
        
        // Fallback: lấy từ localStorage nếu vẫn chưa có
        if (!guestInfo.name || guestInfo.name === 'Khách lẻ') {
          const checkinData = this.checkinCache.getSync(this.room._id);
          if (checkinData) {
            try {
              if (checkinData.guestInfo?.name && checkinData.guestInfo.name !== 'Khách lẻ') {
                guestInfo = { ...guestInfo, ...checkinData.guestInfo };
                if (!checkinTime) {
                  checkinTime = checkinData.checkinTime ? new Date(checkinData.checkinTime) : null;
                }
                if (!rateType) {
                  rateType = checkinData.rateType || '';
                }
                if (!advancePayment) {
                  advancePayment = checkinData.advancePayment || 0;
                }
              }
            } catch (e) {
              console.error('Error parsing checkin data:', e);
            }
          }
        }
        
        // Đảm bảo có name, nếu không thì mặc định "Khách lẻ"
        if (!guestInfo.name) {
          guestInfo = { ...guestInfo, name: 'Khách lẻ' };
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
              ${guestInfo.guestSource ? `<p><strong>🔗 Nguồn khách:</strong> ${guestInfo.guestSource || 'Chưa có'}</p>` : ''}
              <hr style="border: none; border-top: 1px dashed #d9d9d9; margin: 12px 0;" />
              <p><strong>🕐 Nhận phòng:</strong> ${formatDateTime(checkinTime)}</p>
              <p><strong>💰 Loại giá:</strong> ${rateTypeLabels[rateType] || 'Chưa xác định'}</p>
              <p><strong>💵 Đặt trước:</strong> ${advancePayment > 0 ? formatCurrency(advancePayment) : 'Không'}</p>
            </div>
          `,
          nzOkText: 'Đóng',
          nzWidth: 450
        });
      },
      error: (error) => {
        console.error('Error loading room data:', error);
        // Fallback: sử dụng dữ liệu từ room hiện tại
        this.showGuestInfoFromRoom();
      }
    });
  }
  
  // Fallback: hiển thị thông tin khách từ room hiện tại (không load từ backend)
  private showGuestInfoFromRoom(): void {
    let guestInfo: any = {};
    let checkinTime: Date | null = null;
    let rateType: string = '';
    let advancePayment: number = 0;
    
    if (this.room.events && this.room.events.length > 0) {
      const checkinEvents = this.room.events.filter((e: any) => e.type === 'checkin');
      if (checkinEvents.length > 0) {
        const lastCheckin = checkinEvents[checkinEvents.length - 1];
        guestInfo = lastCheckin.guestInfo || {};
        checkinTime = lastCheckin.checkinTime ? new Date(lastCheckin.checkinTime) : null;
        rateType = lastCheckin.rateType || '';
        advancePayment = lastCheckin.advancePayment || 0;
      }
    }
    
    // Thử lấy từ currentBooking
    if ((!guestInfo.name || guestInfo.name === 'Khách lẻ') && this.room.currentBooking) {
      const currentBooking = typeof this.room.currentBooking === 'object' ? this.room.currentBooking : null;
      if (currentBooking?.guestInfo?.name && currentBooking.guestInfo.name !== 'Khách lẻ') {
        guestInfo = {
          ...guestInfo,
          name: currentBooking.guestInfo.name,
          phone: currentBooking.guestInfo.phone || guestInfo.phone,
          email: currentBooking.guestInfo.email || guestInfo.email,
          idNumber: currentBooking.guestInfo.idNumber || guestInfo.idNumber,
          address: currentBooking.guestInfo.address || guestInfo.address
        };
      }
    }
    
    if (!guestInfo.name) {
      guestInfo = { ...guestInfo, name: 'Khách lẻ' };
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
          ${guestInfo.guestSource ? `<p><strong>🔗 Nguồn khách:</strong> ${guestInfo.guestSource || 'Chưa có'}</p>` : ''}
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
    if (!this.room || !this.room._id) {
      this.modalService.error({
        nzTitle: 'Lỗi',
        nzContent: 'Không tìm thấy thông tin phòng.',
        nzOkText: 'Đóng'
      });
      return;
    }
    
    // Load thông tin phòng mới nhất từ backend để đảm bảo có dữ liệu chính xác
    this.roomsService.getRoomById(this.room._id, { excludeCheckedOut: true }).subscribe({
      next: (roomData) => {
        // Lấy thông tin khách từ nhiều nguồn
        let guestInfo: any = null;
        
        // 1. Lấy từ room events (check-in event chưa được checkout)
        if (roomData.events && roomData.events.length > 0) {
          const checkinEvents = roomData.events.filter((e: any) => e.type === 'checkin');
          if (checkinEvents.length > 0) {
            const lastCheckin = checkinEvents[checkinEvents.length - 1];
            guestInfo = lastCheckin.guestInfo || null;
          }
        }
        
        // 2. Nếu guestInfo không có hoặc name là "Khách lẻ", thử lấy từ currentBooking
        if (!guestInfo || !guestInfo.name || guestInfo.name === 'Khách lẻ') {
          if (roomData.currentBooking && typeof roomData.currentBooking === 'object') {
            const currentBooking = roomData.currentBooking;
            if (currentBooking.guestInfo?.name && currentBooking.guestInfo.name !== 'Khách lẻ') {
              guestInfo = {
                ...(guestInfo || {}),
                name: currentBooking.guestInfo.name,
                phone: currentBooking.guestInfo.phone || guestInfo?.phone,
                email: currentBooking.guestInfo.email || guestInfo?.email,
                idNumber: currentBooking.guestInfo.idNumber || guestInfo?.idNumber,
                address: currentBooking.guestInfo.address || guestInfo?.address,
                guestSource: currentBooking.guestInfo.guestSource || guestInfo?.guestSource
              };
            }
          }
        }
        
        // 3. Cập nhật room với dữ liệu mới nhất
        const updatedRoom = { ...this.room, ...roomData };
        
        // Mở modal GuestSaveModalComponent
        const modalRef = this.modalService.create({
          nzTitle: 'Lưu thông tin khách',
          nzContent: GuestSaveModalComponent,
          nzFooter: null,
          nzWidth: 900,
          nzMaskClosable: false,
          nzData: {
            room: updatedRoom,
            guestInfo: guestInfo
          }
        });
        
        modalRef.afterClose.subscribe((result) => {
          if (result && result.success) {
            this.notifyRoomChanged();
            // Đảm bảo đóng context menu nếu còn mở
            if (this.contextMenuModalRef) {
              this.contextMenuModalRef.close();
              this.contextMenuModalRef = null;
            }
          }
        });
      },
      error: (error) => {
        console.error('Error loading room data:', error);
        // Fallback: sử dụng dữ liệu từ room hiện tại
        let guestInfo: any = null;
        if (this.room.events && this.room.events.length > 0) {
          const checkinEvents = this.room.events.filter((e: any) => e.type === 'checkin');
          if (checkinEvents.length > 0) {
            const lastCheckin = checkinEvents[checkinEvents.length - 1];
            guestInfo = lastCheckin.guestInfo || null;
          }
        }
        
        // Thử lấy từ currentBooking
        if ((!guestInfo || !guestInfo.name || guestInfo.name === 'Khách lẻ') && this.room.currentBooking) {
          const currentBooking = typeof this.room.currentBooking === 'object' ? this.room.currentBooking : null;
          if (currentBooking?.guestInfo?.name && currentBooking.guestInfo.name !== 'Khách lẻ') {
            guestInfo = {
              ...(guestInfo || {}),
              name: currentBooking.guestInfo.name,
              phone: currentBooking.guestInfo.phone || guestInfo?.phone,
              email: currentBooking.guestInfo.email || guestInfo?.email,
              idNumber: currentBooking.guestInfo.idNumber || guestInfo?.idNumber,
              address: currentBooking.guestInfo.address || guestInfo?.address,
              guestSource: currentBooking.guestInfo.guestSource || guestInfo?.guestSource
            };
          }
        }
        
        // Mở modal GuestSaveModalComponent với dữ liệu fallback
        const modalRef = this.modalService.create({
          nzTitle: 'Lưu thông tin khách',
          nzContent: GuestSaveModalComponent,
          nzFooter: null,
          nzWidth: 900,
          nzMaskClosable: false,
          nzData: {
            room: this.room,
            guestInfo: guestInfo
          }
        });
        
        modalRef.afterClose.subscribe((result) => {
          if (result && result.success) {
            this.notifyRoomChanged();
            // Đảm bảo đóng context menu nếu còn mở
            if (this.contextMenuModalRef) {
              this.contextMenuModalRef.close();
              this.contextMenuModalRef = null;
            }
          }
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
    // Xử lý hotelId (có thể là object hoặc string)
    let hotelId: string | null = null;
    if (this.room.hotelId) {
      if (typeof this.room.hotelId === 'string') {
        hotelId = this.room.hotelId;
      } else if (typeof this.room.hotelId === 'object' && this.room.hotelId !== null) {
        const hotelIdObj = this.room.hotelId as any;
        hotelId = hotelIdObj._id ? String(hotelIdObj._id) : String(hotelIdObj);
      }
    }
    
    // Nếu không có hotelId, lấy từ session context
    if (!hotelId) {
      hotelId = this.hotelService.getStoredHotelId();
    }
    
    let bookingModalRef: NzModalRef | null = null;
    bookingModalRef = this.modalService.create({
      nzTitle: this.translate.instant('BOOKING_MODAL.TITLE_FOR_ROOM', { roomNumber: this.room.roomNumber }),
      nzContent: BookingModalComponent,
      nzData: {
        selectedDate: new Date(),
        hotelId: hotelId,
        roomId: this.room._id,
        rooms: [this.room] // Chỉ hiển thị phòng hiện tại
      },
      nzFooter: [
        {
          label: this.translate.instant('COMMON.CANCEL'),
          onClick: () => bookingModalRef?.close()
        },
        {
          label: this.translate.instant('BOOKING_MODAL.EXPORT_PDF_CONFIRMATION'),
          onClick: () => {
            const instance = bookingModalRef?.getContentComponent() as BookingModalComponent;
            if (instance) {
              instance.exportConfirmationPDF();
            }
          }
        },
        {
          label: this.translate.instant('BOOKING_MODAL.SUBMIT_BOOKING'),
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
        this.notifyRoomChanged();
      }
    });
  }
  
  // Đánh dấu phòng đã dọn xong
  markRoomAsClean(): void {
    const previousStatus = this.room.status;
    this.applyLocalRoomStatus('vacant');
    this.notifyRoomChanged('cleaning', { delayMs: 0, refreshRooms: false, refreshHistory: false });
    this.roomsService.cleanRoom(this.room._id, { status: 'vacant' })
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          const updated = response?.room || response;
          if (updated?.status) {
            Object.assign(this.room, { status: 'vacant', events: [], currentBooking: undefined, guestStatus: undefined });
          } else {
            this.applyLocalRoomStatus('vacant');
          }
          if (this.contextMenuModalRef) {
            this.contextMenuModalRef.close();
            this.contextMenuModalRef = null;
          }
        },
        error: (err) => {
          this.applyLocalRoomStatus(previousStatus);
          this.notifyRoomChanged('cleaning', { delayMs: 0, refreshRooms: false, refreshHistory: false });
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
    const previousStatus = this.room.status;
    this.applyLocalRoomStatus('dirty');
    this.notifyRoomChanged('dirty', { delayMs: 0, refreshRooms: false, refreshHistory: false });
    this.roomsService.updateRoomStatus(
      this.room._id,
      'dirty',
      this.sessionContext.getStaffId() || 'unknown',
      'Báo bẩn từ menu'
    ).pipe(take(1)).subscribe({
      next: (updatedRoom) => {
        if (updatedRoom) {
          Object.assign(this.room, updatedRoom);
          this.applyLocalRoomStatus('dirty');
        }
      },
      error: (err) => {
        this.applyLocalRoomStatus(previousStatus);
        this.notifyRoomChanged('dirty', { delayMs: 0, refreshRooms: false, refreshHistory: false });
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
    const previousStatus = this.room.status;
    this.applyLocalRoomStatus('maintenance');
    this.notifyRoomChanged('maintenance', { delayMs: 0, refreshRooms: false, refreshHistory: false });
    this.roomsService.updateRoomStatus(
      this.room._id,
      'maintenance',
      this.sessionContext.getStaffId() || 'unknown',
      'Báo sửa phòng từ menu'
    ).pipe(take(1)).subscribe({
      next: (updatedRoom) => {
        if (updatedRoom) {
          Object.assign(this.room, updatedRoom, { events: [], currentBooking: undefined, guestStatus: undefined });
        } else {
          this.applyLocalRoomStatus('maintenance');
        }
      },
      error: (err) => {
        this.applyLocalRoomStatus(previousStatus);
        this.notifyRoomChanged('maintenance', { delayMs: 0, refreshRooms: false, refreshHistory: false });
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
        this.checkinCache.set(this.room._id, checkinData);
      }
      
      // Delay notify để tránh trigger mở modal lại
      setTimeout(() => {
        // Chỉ notify nếu modal đã thực sự đóng và không có modal mới được mở
        if (!this.modalRef && closedModalRef) {
          this.notifyRoomChanged('checkin', { delayMs: 0 });
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

    const openTransferModal = (filteredRooms: Room[]) => {
      if (filteredRooms.length === 0) {
        this.modalService.info({
          nzTitle: 'Thông báo',
          nzContent: 'Không có phòng trống nào để chuyển đến.',
          nzOkText: 'Đóng'
        });
        return;
      }

      this.modalRef = this.modalService.create({
        nzTitle: `Chuyển phòng - Từ phòng ${this.room.roomNumber}`,
        nzContent: TransferRoomModalComponent,
        nzWidth: 500,
        nzData: {
          sourceRoom: this.room,
          availableRooms: filteredRooms
        },
        nzFooter: null,
        nzMaskClosable: false
      });

      this.modalRef.afterClose.pipe(
        take(1),
        takeUntil(this.destroy$)
      ).subscribe((result: any) => {
        if (result?.success) {
          this.applyLocalTransferResult(result.response);
        }
        this.modalRef = null;
      });
    };

    // Ưu tiên phòng trống từ cache sơ đồ — không chờ GET /available
    const hotelId = this.extractHotelId();
    const cachedRooms = hotelId ? (this.roomsService.getCachedRooms(hotelId) || []) : [];
    const localVacant = cachedRooms.filter(
      (r) => r._id !== this.room._id && r.status === 'vacant'
    );

    if (localVacant.length > 0) {
      openTransferModal(localVacant);
      return;
    }

    this.roomsService.getAvailableRooms({ hotelId }).pipe(
      take(1),
      takeUntil(this.destroy$)
    ).subscribe(
      (availableRooms) => {
        const filteredRooms = availableRooms.filter(
          (r) => r._id !== this.room._id && r.status === 'vacant'
        );
        openTransferModal(filteredRooms);
      },
      (error) => {
        console.error('Error loading available rooms:', error);
        this.modalService.error({
          nzTitle: 'Lỗi',
          nzContent: error.error?.error || error.error?.message || 'Không thể lấy danh sách phòng trống. Vui lòng thử lại sau.',
          nzOkText: 'Đóng'
        });
      }
    );
  }

  /** Optimistic board sau chuyển phòng — không GET /rooms/:id */
  private applyLocalTransferResult(response: any): void {
    const targetRoom = response?.targetRoom;
    const checkinEvent = response?.checkinEvent;
    const booking = response?.booking;
    const targetRoomNumber = targetRoom?.roomNumber || 'N/A';
    const hotelId = this.extractHotelId();
    const sourceBooking = this.room.currentBooking;

    if (checkinEvent && targetRoom?._id) {
      try {
        this.checkinCache.set(targetRoom._id, {
          checkinTime: checkinEvent.checkinTime,
          guestInfo: checkinEvent.guestInfo || {},
          rateType: checkinEvent.rateType || 'hourly',
          advancePayment: checkinEvent.advancePayment || 0,
          additionalCharges: checkinEvent.additionalCharges || 0,
          discount: checkinEvent.discount || 0,
          selectedServices: checkinEvent.selectedServices || [],
          paymentMethod: checkinEvent.paymentMethod || 'cash',
          expectedCheckoutTime: checkinEvent.expectedCheckoutTime,
          roomId: targetRoom._id,
          roomNumber: targetRoom.roomNumber,
          transferredFrom: checkinEvent.transferredFrom || this.room._id,
          transferredFromRoomNumber: this.room.roomNumber,
          transferredAt: checkinEvent.transferredAt || new Date()
        });
      } catch (e) {
        console.error('Error saving transfer checkin data:', e);
      }
    }
    this.checkinCache.remove(this.room._id);

    // Phòng nguồn → dirty
    this.room.status = 'dirty';
    this.room.guestStatus = undefined;
    this.room.events = [];
    this.room.currentBooking = undefined as any;
    if (hotelId) {
      this.roomsService.patchCachedRoom(hotelId, this.room);
    }

    // Phòng đích → occupied + synthetic checkin
    if (hotelId && targetRoom?._id) {
      const rooms = this.roomsService.getCachedRooms(hotelId) || [];
      const targetLocal = rooms.find((r) => String(r._id) === String(targetRoom._id));
      if (targetLocal) {
        const checkinTime =
          checkinEvent?.checkinTime ||
          (sourceBooking as any)?.checkinTime ||
          (sourceBooking as any)?.checkInDate ||
          new Date();
        targetLocal.status = 'occupied';
        targetLocal.guestStatus = 'in';
        targetLocal.currentBooking = (booking as any) || sourceBooking || targetRoom.currentBooking;
        targetLocal.events = [
          {
            type: 'checkin',
            __synthetic: true,
            checkinTime,
            guestInfo: checkinEvent?.guestInfo || (sourceBooking as any)?.guestInfo || {},
            rateType: checkinEvent?.rateType || 'hourly',
            advancePayment: checkinEvent?.advancePayment || 0,
            additionalCharges: checkinEvent?.additionalCharges || 0,
            discount: checkinEvent?.discount || 0,
            selectedServices: checkinEvent?.selectedServices || [],
            transferredFrom: this.room._id,
            transferredAt: checkinEvent?.transferredAt || new Date()
          } as any
        ];
        this.roomsService.patchCachedRoom(hotelId, targetLocal);
      }
    }

    let message = `Đã chuyển khách từ phòng ${this.room.roomNumber} sang phòng ${targetRoomNumber}`;
    if (targetRoom) {
      message += `\n\nPhòng đích: ${targetRoom.roomNumber} - ${targetRoom.type || 'N/A'}`;
    }
    this.modalService.success({
      nzTitle: 'Chuyển phòng thành công',
      nzContent: message,
      nzOkText: 'Đóng'
    });

    this.notifyRoomChanged('transfer', {
      relatedRoomId: targetRoom?._id,
      delayMs: 0,
      refreshRooms: false,
      refreshHistory: false
    });
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
                this.sessionContext.getStaffId() || 'unknown',
                statusNote?.value || ''
              ).pipe(
                take(1),
                takeUntil(this.destroy$)
              ).subscribe(
                (response) => {
                  const updatedRoom = (response as any)?.room || response;
                  if (updatedRoom) {
                    Object.assign(this.room, updatedRoom);
                    this.applyLocalRoomStatus(statusSelect.value as Room['status']);
                  } else {
                    this.applyLocalRoomStatus(statusSelect.value as Room['status']);
                  }
                  this.modalRef?.close();
                  
                  const statusLabels: {[key: string]: string} = {
                    'vacant': 'Trống',
                    'dirty': 'Cần dọn dẹp', 
                    'maintenance': 'Bảo trì',
                    'occupied': 'Đang sử dụng',
                    'cleaning': 'Đang dọn dẹp'
                  };
                  
                  this.modalService.success({
                    nzTitle: 'Thành công',
                    nzContent: `Đã cập nhật trạng thái phòng ${this.room.roomNumber} thành "${statusLabels[statusSelect.value] || statusSelect.value}"`,
                    nzOkText: 'Đóng'
                  });
                  this.notifyRoomChanged('status', { delayMs: 0, refreshRooms: false, refreshHistory: false });
                },
                (error) => {
                  this.modalService.error({
                    nzTitle: 'Lỗi',
                    nzContent: error.error?.error || 'Không thể cập nhật trạng thái phòng, vui lòng thử lại sau.',
                    nzOkText: 'Đóng'
                  });
                  
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

    this.modalRef.afterClose.pipe(
      take(1),
      takeUntil(this.destroy$)
    ).subscribe((result: any) => {
      this.isModalOpening = false;
      this.modalRef = null;
      const reason: RoomDataUpdateEvent['reason'] =
        type === 'checkin' ? 'checkin' :
        type === 'checkout' ? 'checkout' :
        type === 'cleaning' ? 'cleaning' : 'generic';
      Promise.resolve().then(() => {
        if (!this.modalRef) {
          this.notifyRoomChanged(reason, { delayMs: result?.success === false ? 0 : 80 });
        }
      });
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
    if (status === 'booked' && this.isPrebookedAvailable()) {
      return 'checkin';
    }
    
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

  private getBookingCheckInTime(): Date | null {
    const booking: any = (this.room as any)?.currentBooking;
    if (booking?.checkInDate) {
      const d = new Date(booking.checkInDate);
      return isNaN(d.getTime()) ? null : d;
    }

    const events: any[] = Array.isArray((this.room as any)?.events) ? (this.room as any).events : [];
    const bookingEvent = events.find(e => e && e.type === 'booking');
    if (bookingEvent?.checkinTime || bookingEvent?.checkInTime || bookingEvent?.checkInDate || bookingEvent?.checkinDate) {
      const d = new Date(bookingEvent.checkinTime || bookingEvent.checkInTime || bookingEvent.checkInDate || bookingEvent.checkinDate);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  private isPrebookedAvailable(): boolean {
    if (!this.room || this.room.status === 'occupied') return false;
    const checkinTime = this.getBookingCheckInTime();
    if (!checkinTime) return false;
    return checkinTime.getTime() > Date.now();
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
          this.notifyRoomChanged('checkin');
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
          this.notifyRoomChanged('checkout');
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
          this.notifyRoomChanged('cleaning');
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
    if (!checkinTime || !checkoutTime || !this.room || !this.room._id) {
      return 0;
    }

    // Chuyển đổi chuỗi ngày thành đối tượng Date
    const checkinDate = new Date(checkinTime);
    const checkoutDate = new Date(checkoutTime);
    
    // Tính thời gian chính xác theo phút
    const durationInMilliseconds = checkoutDate.getTime() - checkinDate.getTime();
    const durationInMinutes = Math.floor(durationInMilliseconds / (1000 * 60));
    const durationInHours = Math.floor(durationInMinutes / 60);
    const remainingMinutes = durationInMinutes % 60;
    
    // Lấy giá từ room (ước tính đơn giản)
    const hourlyRate = this.room.pricing?.hourly || this.room.firstHourRate || 0;
    const dailyRate = this.room.pricing?.daily || 0;
    const nightlyRate = this.room.pricing?.nightly || 0;
    const additionalHourRate = this.room.additionalHourRate || (hourlyRate * 0.8);
    
    // Tính giá ước tính đơn giản (không tính phụ thu, không tự động chuyển đổi)
    // Logic chính xác sẽ được backend xử lý khi checkout
    let roomTotal = 0;
    
    // Tính giá giờ đầu + các giờ tiếp theo (ước tính)
    if (this.room.firstHourRate && this.room.additionalHourRate) {
      roomTotal = this.room.firstHourRate;
      if (durationInHours > 1) {
        roomTotal += (durationInHours - 1) * this.room.additionalHourRate;
      }
    } else {
      roomTotal = hourlyRate * durationInHours;
    }
    
    // --- TÍNH TIỀN DỊCH VỤ ---
    let serviceTotal = 0;
    let additionalCharge = 0;
    let discount = 0;
    
    const checkinInfo = this.checkinCache.getSync(this.room._id);
    if (checkinInfo) {
      try {
        if (checkinInfo.selectedServices && Array.isArray(checkinInfo.selectedServices) && checkinInfo.selectedServices.length > 0) {
          serviceTotal = checkinInfo.selectedServices.reduce((sum: number, service: any) => {
            return sum + (service.price * (service.quantity || 1));
          }, 0);
        }
        
        if (checkinInfo.additionalCharges) {
          additionalCharge += checkinInfo.additionalCharges;
        }
        
        if (checkinInfo.discount) {
          discount += checkinInfo.discount;
        }
      } catch (error) {
        console.error('Lỗi khi tính tiền dịch vụ:', error);
      }
    }
    
    // --- TÍNH TỔNG TIỀN (ước tính) ---
    // Lưu ý: Tính toán chính xác sẽ được backend xử lý khi checkout
    const totalPrice = roomTotal + serviceTotal + additionalCharge - discount;
    
    return Math.max(0, Math.round(totalPrice));
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
    let checkinInfo = this.checkinCache.getSync(this.room._id);
    
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
      staffName: this.sessionContext.getStaffName() || 'Nhân viên',
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
    const checkinInfo = this.checkinCache.getSync(roomId);
    
    if (checkinInfo) {
      try {
        
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
          this.checkinCache.remove(roomId);
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
                            this.hotelService.getStoredHotelId();
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
                              this.hotelService.getStoredHotelId();
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
        staffId: invoiceData.staffId || this.sessionContext.getStaffId() || '',
        staffName: invoiceData.staffName || this.sessionContext.getStaffName() || 'Nhân viên',
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
