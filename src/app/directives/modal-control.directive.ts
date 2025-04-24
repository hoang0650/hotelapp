import { Directive, HostListener, Input, OnInit, OnDestroy } from '@angular/core';
import { NzModalService, NzModalRef } from 'ng-zorro-antd/modal';
import { RoomsService } from '../services/rooms.service';
import { take, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { RoomContentModalComponent } from '../components/room-content-modal/room-content-modal.component';
import { InvoiceComponent } from '../components/invoice/invoice.component';

@Directive({
  selector: '[appModalControl]',
  exportAs: 'appModalControl'
})
export class ModalControlDirective implements OnInit, OnDestroy {
  @Input() room: any; // Phòng được truyền vào directive
  private destroy$ = new Subject<void>();
  private modalRef: NzModalRef | null = null;

  constructor(
    private modalService: NzModalService,
    private roomsService: RoomsService
  ) {}

  ngOnInit(): void {
    // Khởi tạo nếu cần
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('click') onClick() {
    if (this.room) {
      this.showModal();
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
    // Tạo và hiển thị menu tùy chọn
    const contextMenuModalRef = this.modalService.create({
      nzTitle: `Phòng ${this.room.roomNumber} - Tùy chọn`,
      nzContent: `
        <div class="room-context-menu">
          <button class="context-menu-btn" id="checkin-btn">Nhận phòng</button>
          <button class="context-menu-btn" id="transfer-btn">Chuyển phòng</button>
          <button class="context-menu-btn" id="status-btn">Cập nhật trạng thái</button>
        </div>
        <style>
          .room-context-menu {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .context-menu-btn {
            padding: 10px;
            text-align: left;
            background-color: #f5f5f5;
            border: 1px solid #e8e8e8;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.3s;
          }
          .context-menu-btn:hover {
            background-color: #1890ff;
            color: white;
          }
        </style>
      `,
      nzFooter: null,
      nzMaskClosable: true,
      nzClosable: true,
      nzWidth: 300,
      nzStyle: { position: 'fixed', left: `${event.clientX}px`, top: `${event.clientY}px` }
    });

    // Đăng ký các sự kiện cho các nút trong menu
    contextMenuModalRef.afterOpen.subscribe(() => {
      const modalElement = document.getElementsByClassName('ant-modal')[0] as HTMLElement;
      
      // Nút nhận phòng
      const checkinBtn = modalElement.querySelector('#checkin-btn');
      if (checkinBtn) {
        checkinBtn.addEventListener('click', () => {
          contextMenuModalRef.close();
          this.showCheckinModal();
        });
      }
      
      // Nút chuyển phòng
      const transferBtn = modalElement.querySelector('#transfer-btn');
      if (transferBtn) {
        transferBtn.addEventListener('click', () => {
          contextMenuModalRef.close();
          this.showTransferModal();
        });
      }
      
      // Nút cập nhật trạng thái
      const statusBtn = modalElement.querySelector('#status-btn');
      if (statusBtn) {
        statusBtn.addEventListener('click', () => {
          contextMenuModalRef.close();
          this.showStatusUpdateModal();
        });
      }
    });
  }

  // Hiển thị modal nhận phòng
  showCheckinModal(): void {
    if (this.room.roomStatus !== 'available') {
      this.modalService.info({
        nzTitle: 'Thông báo',
        nzContent: 'Chỉ có thể nhận phòng khi phòng đang trống.',
        nzOkText: 'Đóng'
      });
      return;
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
      
      this.roomsService.notifyRoomDataUpdated();
    });
  }

  // Hiển thị modal chuyển phòng
  showTransferModal(): void {
    if (this.room.roomStatus !== 'occupied') {
      this.modalService.info({
        nzTitle: 'Thông báo',
        nzContent: 'Chỉ có thể chuyển phòng khi phòng đang có khách.',
        nzOkText: 'Đóng'
      });
      return;
    }
    
    // Lấy danh sách phòng trống
    this.roomsService.getAvailableRooms(this.room.hotelId).pipe(
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
                  ${filteredRooms.map(room => `<option value="${room._id}">${room.roomNumber} - ${room.roomType}</option>`).join('')}
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
                  this.roomsService.transferRoom(
                    this.room._id,
                    targetRoomSelect.value,
                    localStorage.getItem('staffId') || 'unknown',
                    transferNote?.value || ''
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
    const currentStatus = this.room.roomStatus;
    
    // Tạo danh sách trạng thái có thể chuyển đổi dựa trên trạng thái hiện tại
    let availableStatuses = [
      { value: 'available', label: 'Trống' },
      { value: 'dirty', label: 'Cần dọn dẹp' },
      { value: 'maintenance', label: 'Bảo trì' }
    ];
    
    // Nếu đang ở trạng thái occupied, chỉ cho phép giữ nguyên
    if (currentStatus === 'occupied') {
      availableStatuses = [
        { value: 'occupied', label: 'Đang sử dụng' }
      ];
      
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
                statusSelect.value,
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
                    'available': 'Trống',
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

  showModal(): void {
    // Xác định loại modal dựa trên trạng thái phòng
    const modalType = this.getModalType();
    const modalTitle = this.getModalTitle();

    // Tạo cấu hình modal tùy theo trạng thái phòng
    this.modalRef = this.modalService.create({
      nzTitle: modalTitle,
      nzContent: RoomContentModalComponent,
      nzData: {
        roomData: this.room,
        skipValidation: false, // Đổi thành false để bật validation mặc định
        modalType: modalType 
      },
      nzWidth: 800,
      nzFooter: null, 
      nzMaskClosable: false,
      nzClosable: true,
      // Bỏ nzOnOk vì logic xử lý đã nằm trong component
    });
    
    // Lắng nghe sự kiện đóng modal để cập nhật dữ liệu
    this.modalRef.afterClose.pipe(
      take(1),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.roomsService.notifyRoomDataUpdated();
    });
  }

  // Xác định loại modal dựa trên trạng thái phòng
  getModalType(): string {
    switch (this.room.roomStatus) {
      case 'available':
        return 'checkin';
      case 'active':
      case 'occupied':
        return 'checkout';
      case 'dirty':
      case 'maintenance': // Trả về 'cleaning' cho cả maintenance
        return 'cleaning'; 
      default:
        console.warn(`Trạng thái phòng không xác định: ${this.room.roomStatus}. Mở modal thông tin mặc định.`);
        return 'info'; // 'info' chưa được xử lý trong template, cân nhắc thêm hoặc trả về null/error
    }
  }

  // Xác định tiêu đề modal dựa trên trạng thái phòng
  getModalTitle(): string {
    switch (this.room.roomStatus) {
      case 'available':
        return 'Nhận Phòng';
      case 'active':
      case 'occupied':
        return 'Trả Phòng';
      case 'dirty':
      case 'maintenance': // Cập nhật tiêu đề cho maintenance
        return 'Dọn Dẹp/Sẵn Sàng'; 
      default:
        return 'Thông Tin Phòng';
    }
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
  }
}